use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("FxPnV48rg9KkK6huUimjcjL9H4xssM8n7j3uva8k9tmc");

#[program]
pub mod nirvana_protocol {
    use super::*;

    pub fn create_stream(
        ctx: Context<CreateStream>,
        base_amount: u64,
        cliff_amount: u64,
        milestone_amount: u64,
        start_time: i64,
        end_time: i64,
        cliff_time: i64,
        arbiter: Option<Pubkey>,
    ) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        let now = Clock::get()?.unix_timestamp;

        require!(end_time > start_time, NirvanaError::InvalidTimeRange);
        require!(cliff_time >= start_time && cliff_time <= end_time, NirvanaError::InvalidCliff);
        require!(start_time >= now, NirvanaError::StartTimeInPast);

        let total = base_amount
            .checked_add(cliff_amount)
            .ok_or(NirvanaError::MathOverflow)?
            .checked_add(milestone_amount)
            .ok_or(NirvanaError::MathOverflow)?;

        require!(total > 0, NirvanaError::ZeroDepositAmount);

        state.authority = ctx.accounts.authority.key();
        state.recipient = ctx.accounts.recipient.key();
        state.token_mint = ctx.accounts.token_mint.key();
        state.arbiter = arbiter.unwrap_or_default();
        state.base_amount = base_amount;
        state.cliff_amount = cliff_amount;
        state.milestone_amount = milestone_amount;
        state.claimed_amount = 0;
        state.start_time = start_time;
        state.end_time = end_time;
        state.cliff_time = cliff_time;
        state.milestone_achieved = false;
        state.is_cancelled = false;
        state.bump = ctx.bumps.distribution_state;

        let cpi_accounts = Transfer {
            from: ctx.accounts.authority_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            total,
        )?;

        emit!(StreamCreated {
            authority: state.authority,
            recipient: state.recipient,
            total_amount: total,
        });

        Ok(())
    }

    pub fn trigger_milestone(ctx: Context<TriggerMilestone>) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        let now = Clock::get()?.unix_timestamp;

        // Either the authority or a designated arbiter may confirm the milestone.
        let signer = ctx.accounts.triggerer.key();
        let is_authority = signer == state.authority;
        let is_arbiter = state.arbiter != Pubkey::default() && signer == state.arbiter;
        require!(is_authority || is_arbiter, NirvanaError::Unauthorized);

        require!(!state.is_cancelled, NirvanaError::StreamCancelled);
        require!(!state.milestone_achieved, NirvanaError::MilestoneAlreadyAchieved);
        require!(now <= state.end_time, NirvanaError::StreamExpired);

        state.milestone_achieved = true;

        emit!(MilestoneTriggered {
            recipient: state.recipient,
        });

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        let now = Clock::get()?.unix_timestamp;

        require!(!state.is_cancelled, NirvanaError::StreamCancelled);
        require!(now >= state.cliff_time, NirvanaError::CliffNotReached);

        let total_duration = state
            .end_time
            .checked_sub(state.start_time)
            .ok_or(NirvanaError::MathOverflow)?;

        let elapsed = if now > state.end_time {
            total_duration
        } else {
            now.checked_sub(state.start_time)
                .ok_or(NirvanaError::MathOverflow)?
        };

        let linear = if total_duration > 0 {
            (state.base_amount as u128)
                .checked_mul(elapsed as u128)
                .ok_or(NirvanaError::MathOverflow)?
                .checked_div(total_duration as u128)
                .ok_or(NirvanaError::MathOverflow)? as u64
        } else {
            state.base_amount
        };

        let milestone = if state.milestone_achieved {
            state.milestone_amount
        } else {
            0
        };

        // cliff_time has been reached (checked above), so the cliff lump is unlocked.
        let unlocked = linear
            .checked_add(state.cliff_amount)
            .ok_or(NirvanaError::MathOverflow)?
            .checked_add(milestone)
            .ok_or(NirvanaError::MathOverflow)?;

        let claimable = unlocked
            .checked_sub(state.claimed_amount)
            .ok_or(NirvanaError::MathOverflow)?;

        require!(claimable > 0, NirvanaError::NothingToWithdraw);

        state.claimed_amount = state
            .claimed_amount
            .checked_add(claimable)
            .ok_or(NirvanaError::MathOverflow)?;

        let seeds = &[
            b"state",
            state.authority.as_ref(),
            state.recipient.as_ref(),
            &[state.bump],
        ];

        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.token_vault.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: state.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer,
            ),
            claimable,
        )?;

        emit!(Withdrawn {
            recipient: state.recipient,
            amount: claimable,
        });

        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        let now = Clock::get()?.unix_timestamp;

        require!(!state.is_cancelled, NirvanaError::AlreadyCancelled);
        require!(now < state.end_time, NirvanaError::FullyVested);

        let balance = ctx.accounts.token_vault.amount;

        let linear_unlocked;
        let milestone_unlocked;

        if now >= state.cliff_time {
            let total_duration = state
                .end_time
                .checked_sub(state.start_time)
                .ok_or(NirvanaError::MathOverflow)?;

            let elapsed = if now > state.end_time {
                total_duration
            } else {
                now.checked_sub(state.start_time)
                    .ok_or(NirvanaError::MathOverflow)?
            };

            let linear = if total_duration > 0 {
                (state.base_amount as u128)
                    .checked_mul(elapsed as u128)
                    .ok_or(NirvanaError::MathOverflow)?
                    .checked_div(total_duration as u128)
                    .ok_or(NirvanaError::MathOverflow)? as u64
            } else {
                state.base_amount
            };

            // past cliff: the cliff lump is unlocked for the recipient too.
            linear_unlocked = linear
                .checked_add(state.cliff_amount)
                .ok_or(NirvanaError::MathOverflow)?;

            milestone_unlocked = if state.milestone_achieved {
                state.milestone_amount
            } else {
                0
            };
        } else {
            linear_unlocked = 0;
            milestone_unlocked = 0;
        }

        let unlocked = linear_unlocked
            .checked_add(milestone_unlocked)
            .ok_or(NirvanaError::MathOverflow)?;

        let recipient_share = unlocked
            .checked_sub(state.claimed_amount)
            .ok_or(NirvanaError::MathOverflow)?
            .min(balance);

        let creator_share = balance
            .checked_sub(recipient_share)
            .ok_or(NirvanaError::MathOverflow)?;

        state.is_cancelled = true;

        let bump = state.bump;

        if recipient_share > 0 {
            let seeds = &[
                b"state",
                state.authority.as_ref(),
                state.recipient.as_ref(),
                &[bump],
            ];
            let signer = &[&seeds[..]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: state.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                ),
                recipient_share,
            )?;
        }

        if creator_share > 0 {
            let seeds = &[
                b"state",
                state.authority.as_ref(),
                state.recipient.as_ref(),
                &[bump],
            ];
            let signer = &[&seeds[..]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.authority_token_account.to_account_info(),
                authority: state.to_account_info(),
            };

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                ),
                creator_share,
            )?;
        }

        // Close the vault SPL TokenAccount so the same (authority, recipient)
        // pair can have a fresh stream later. Without this, the vault PDA sits
        // empty on-chain forever and a new `create_stream` to the same recipient
        // fails with "account already in use".
        let close_seeds = &[
            b"state",
            state.authority.as_ref(),
            state.recipient.as_ref(),
            &[bump],
        ];
        let close_signer = &[&close_seeds[..]];

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.token_vault.to_account_info(),
                destination: ctx.accounts.authority.to_account_info(),
                authority: state.to_account_info(),
            },
            close_signer,
        ))?;

        emit!(Cancelled {
            authority: state.authority,
        });

        Ok(())
    }

    /// Authority adds more linearly-vesting base funds and/or extends the end
    /// time of an active stream. At least one of the two must be a real change.
    pub fn top_up(
        ctx: Context<TopUp>,
        additional_base: u64,
        new_end_time: Option<i64>,
    ) -> Result<()> {
        let state = &mut ctx.accounts.distribution_state;
        let now = Clock::get()?.unix_timestamp;

        require!(!state.is_cancelled, NirvanaError::StreamCancelled);
        require!(now < state.end_time, NirvanaError::FullyVested);
        require!(
            additional_base > 0 || new_end_time.is_some(),
            NirvanaError::NothingToTopUp
        );

        if let Some(end) = new_end_time {
            require!(end > state.end_time, NirvanaError::InvalidExtension);
            state.end_time = end;
        }

        if additional_base > 0 {
            state.base_amount = state
                .base_amount
                .checked_add(additional_base)
                .ok_or(NirvanaError::MathOverflow)?;

            let cpi_accounts = Transfer {
                from: ctx.accounts.authority_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            };
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                additional_base,
            )?;
        }

        emit!(ToppedUp {
            authority: state.authority,
            additional_base,
            new_end_time: state.end_time,
        });

        Ok(())
    }
}

// ---------------- ACCOUNTS ----------------

#[derive(Accounts)]
pub struct CreateStream<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: recipient pubkey is validated via PDA seeds derivation
    pub recipient: UncheckedAccount<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = 8 + DistributionState::INIT_SPACE,
        seeds = [b"state", authority.key().as_ref(), recipient.key().as_ref()],
        bump
    )]
    pub distribution_state: Box<Account<'info, DistributionState>>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault", distribution_state.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = distribution_state
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = authority_token_account.owner == authority.key(),
        constraint = authority_token_account.mint == token_mint.key()
    )]
    pub authority_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        has_one = recipient,
        seeds = [b"state", distribution_state.authority.as_ref(), recipient.key().as_ref()],
        bump = distribution_state.bump
    )]
    pub distribution_state: Box<Account<'info, DistributionState>>,

    #[account(
        mut,
        seeds = [b"vault", distribution_state.key().as_ref()],
        bump
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == distribution_state.token_mint
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TriggerMilestone<'info> {
    /// Authority or arbiter; verified in the handler against stored keys.
    pub triggerer: Signer<'info>,

    #[account(mut)]
    pub distribution_state: Box<Account<'info, DistributionState>>,
}

#[derive(Accounts)]
pub struct TopUp<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority,
        seeds = [b"state", authority.key().as_ref(), distribution_state.recipient.as_ref()],
        bump = distribution_state.bump
    )]
    pub distribution_state: Box<Account<'info, DistributionState>>,

    #[account(
        mut,
        seeds = [b"vault", distribution_state.key().as_ref()],
        bump
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = authority_token_account.owner == authority.key(),
        constraint = authority_token_account.mint == distribution_state.token_mint
    )]
    pub authority_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
        has_one = authority,
        seeds = [b"state", authority.key().as_ref(), distribution_state.recipient.as_ref()],
        bump = distribution_state.bump
    )]
    pub distribution_state: Box<Account<'info, DistributionState>>,

    #[account(
        mut,
        seeds = [b"vault", distribution_state.key().as_ref()],
        bump
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub authority_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == distribution_state.token_mint
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

// ---------------- STATE ----------------

#[account]
#[derive(InitSpace)]
pub struct DistributionState {
    pub authority: Pubkey,
    pub recipient: Pubkey,
    pub token_mint: Pubkey,
    /// Optional third party allowed to trigger the milestone alongside the
    /// authority. `Pubkey::default()` (all zeroes) means "no arbiter".
    pub arbiter: Pubkey,
    pub base_amount: u64,
    /// Lump sum that unlocks in full once `cliff_time` is reached.
    pub cliff_amount: u64,
    pub milestone_amount: u64,
    pub claimed_amount: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub cliff_time: i64,
    pub milestone_achieved: bool,
    pub is_cancelled: bool,
    pub bump: u8,
}

// ---------------- EVENTS ----------------

#[event]
pub struct StreamCreated {
    pub authority: Pubkey,
    pub recipient: Pubkey,
    pub total_amount: u64,
}

#[event]
pub struct Withdrawn {
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Cancelled {
    pub authority: Pubkey,
}

#[event]
pub struct MilestoneTriggered {
    pub recipient: Pubkey,
}

#[event]
pub struct ToppedUp {
    pub authority: Pubkey,
    pub additional_base: u64,
    pub new_end_time: i64,
}

// ---------------- ERRORS ----------------

#[error_code]
pub enum NirvanaError {
    #[msg("Invalid time range.")]
    InvalidTimeRange,
    #[msg("Invalid cliff.")]
    InvalidCliff,
    #[msg("Start time in past.")]
    StartTimeInPast,
    #[msg("Zero deposit.")]
    ZeroDepositAmount,
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Milestone already achieved.")]
    MilestoneAlreadyAchieved,
    #[msg("Stream cancelled.")]
    StreamCancelled,
    #[msg("Already cancelled.")]
    AlreadyCancelled,
    #[msg("Fully vested.")]
    FullyVested,
    #[msg("Cliff not reached.")]
    CliffNotReached,
    #[msg("Nothing to withdraw.")]
    NothingToWithdraw,
    #[msg("Stream expired.")]
    StreamExpired,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Nothing to top up.")]
    NothingToTopUp,
    #[msg("New end time must be later than the current one.")]
    InvalidExtension,
}
