use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Nirvana111111111111111111111111111111111111");

#[program]
pub mod nirvana_protocol {
    use super::*;

    /// Initialize the Equity-Streaming distribution state and fund the vault.
    pub fn create_stream(
        ctx: Context<CreateStream>,
        base_amount: u64,
        milestone_amount: u64,
        start_time: i64,
        end_time: i64,
        cliff_time: i64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        let current_time = Clock::get()?.unix_timestamp;

        // Security validations
        require!(end_time > start_time, NirvanaError::InvalidTimeRange);
        require!(
            cliff_time >= start_time && cliff_time <= end_time,
            NirvanaError::InvalidCliff
        );
        require!(start_time >= current_time, NirvanaError::StartTimeInPast);
        
        let total_deposit = base_amount.checked_add(milestone_amount).unwrap();
        require!(total_deposit > 0, NirvanaError::ZeroDepositAmount);

        // Initialize state fields exactly mapping to the ER Diagram
        state.authority = ctx.accounts.authority.key();
        state.recipient = ctx.accounts.recipient.key();
        state.token_mint = ctx.accounts.token_mint.key();
        state.base_amount = base_amount;
        state.milestone_amount = milestone_amount;
        state.claimed_amount = 0;
        state.start_time = start_time;
        state.end_time = end_time;
        state.cliff_time = cliff_time;
        state.milestone_achieved = false;
        state.is_cancelled = false;

        // Transfer funds from Creator to the PDA Vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.authority_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, total_deposit)?;

        Ok(())
    }

    /// Oracle or Authority triggers this to flip the milestone boolean.
    pub fn trigger_milestone(ctx: Context<TriggerMilestone>) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        
        require!(!state.is_cancelled, NirvanaError::StreamCancelled);
        require!(!state.milestone_achieved, NirvanaError::MilestoneAlreadyAchieved);

        state.milestone_achieved = true;
        Ok(())
    }

    /// Beneficiary claims currently unlocked tokens (Linear + Milestone).
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        let current_time = Clock::get()?.unix_timestamp;

        require!(!state.is_cancelled, NirvanaError::StreamCancelled);
        require!(current_time >= state.cliff_time, NirvanaError::CliffNotReached);

        // Calculate linear stream progress
        let total_duration = state.end_time.checked_sub(state.start_time).unwrap();
        let elapsed = if current_time > state.end_time {
            total_duration
        } else {
            current_time.checked_sub(state.start_time).unwrap()
        };

        // Math: (base_amount * elapsed) / total_duration. Cast to u128 to prevent overflow.
        let linear_unlocked = if total_duration > 0 {
            (state.base_amount as u128)
                .checked_mul(elapsed as u128)
                .unwrap()
                .checked_div(total_duration as u128)
                .unwrap() as u64
        } else {
            state.base_amount
        };

        // Calculate performance bonus
        let milestone_unlocked = if state.milestone_achieved {
            state.milestone_amount
        } else {
            0
        };

        let total_unlocked = linear_unlocked.checked_add(milestone_unlocked).unwrap();
        let claimable = total_unlocked.checked_sub(state.claimed_amount).unwrap();

        require!(claimable > 0, NirvanaError::NothingToClaim);

        // Update state before transfer to prevent re-entrancy
        state.claimed_amount = state.claimed_amount.checked_add(claimable).unwrap();

        // Perform CPI transfer from Vault PDA to Recipient
        let authority_key = state.authority.key();
        let recipient_key = state.recipient.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"state",
            authority_key.as_ref(),
            recipient_key.as_ref(),
            &[ctx.bumps.distribution_state],
        ]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.token_vault.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: state.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        
        token::transfer(cpi_ctx, claimable)?;

        Ok(())
    }

    /// Terminates the stream, refunds unvested tokens to Creator.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        require!(!state.is_cancelled, NirvanaError::StreamCancelled);

        state.is_cancelled = true;

        // Advanced Logic: You can add logic here to force-withdraw the unlocked 
        // portion to the recipient before refunding the rest to the creator.
        // For MVP, we simply lock the state and allow admin to retrieve the vault balance.
        
        let vault_balance = ctx.accounts.token_vault.amount;
        if vault_balance > 0 {
            let authority_key = state.authority.key();
            let recipient_key = state.recipient.key();
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"state",
                authority_key.as_ref(),
                recipient_key.as_ref(),
                &[ctx.bumps.distribution_state],
            ]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.authority_token_account.to_account_info(),
                authority: state.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            
            token::transfer(cpi_ctx, vault_balance)?;
        }

        Ok(())
    }
}

// ------------------------------------------------------------------------
// Accounts Contexts
// ------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CreateStream<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Safely used only as an identifier for PDA derivation
    pub recipient: UncheckedAccount<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + DistributionState::INIT_SPACE,
        seeds = [b"state", authority.key().as_ref(), recipient.key().as_ref()],
        bump
    )]
    pub distribution_state: Account<'info, DistributionState>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"vault", distribution_state.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = distribution_state, // Owned by the State PDA
    )]
    pub token_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TriggerMilestone<'info> {
    /// Restricted strictly to the stream creator/oracle
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ NirvanaError::UnauthorizedTrigger
    )]
    pub distribution_state: Account<'info, DistributionState>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        has_one = recipient @ NirvanaError::UnauthorizedClaimer
    )]
    pub distribution_state: Account<'info, DistributionState>,

    #[account(
        mut,
        seeds = [b"vault", distribution_state.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ NirvanaError::UnauthorizedCancellation
    )]
    pub distribution_state: Account<'info, DistributionState>,

    #[account(
        mut,
        seeds = [b"vault", distribution_state.key().as_ref()],
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ------------------------------------------------------------------------
// State & Errors
// ------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct DistributionState {
    pub authority: Pubkey,
    pub recipient: Pubkey,
    pub token_mint: Pubkey,
    pub base_amount: u64,
    pub milestone_amount: u64,
    pub claimed_amount: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub cliff_time: i64,
    pub milestone_achieved: bool,
    pub is_cancelled: bool,
}

#[error_code]
pub enum NirvanaError {
    #[msg("End time must be strictly greater than start time.")]
    InvalidTimeRange,
    #[msg("Cliff time must be between start and end time.")]
    InvalidCliff,
    #[msg("Stream start time cannot be in the past.")]
    StartTimeInPast,
    #[msg("Total deposit amount must be greater than zero.")]
    ZeroDepositAmount,
    #[msg("Unauthorized: Only the assigned oracle or creator can trigger the milestone.")]
    UnauthorizedTrigger,
    #[msg("Milestone has already been achieved and recorded.")]
    MilestoneAlreadyAchieved,
    #[msg("Unauthorized: Only the designated recipient can claim tokens.")]
    UnauthorizedClaimer,
    #[msg("Unauthorized: Only the creator can cancel the stream.")]
    UnauthorizedCancellation,
    #[msg("The stream has been cancelled.")]
    StreamCancelled,
    #[msg("The cliff period has not been reached yet.")]
    CliffNotReached,
    #[msg("No new tokens are available to claim at this time.")]
    NothingToClaim,
}