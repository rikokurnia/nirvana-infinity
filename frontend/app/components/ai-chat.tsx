"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { GoogleGenAI } from "@google/genai";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are Nirvana AI, a helpful assistant for a Solana-based token vesting protocol called Nirvana Digital Protocol.

Key features: hybrid vesting with linear base (drips over time) and milestone bonus (unlocks when KPI hit). Users choose Founder or Worker role.

Stream presets: Balanced (50% linear, 30% milestone, 20% cliff), Conservative (70/10/20), Aggressive (30/50/20).

Keep responses short (2-3 sentences max), crypto-native casual tone. No markdown.`;

let lastSendTime = 0;
const COOLDOWN_MS = 3000;

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey! I'm Nirvana AI. Ask me about vesting, stream splits, or your token flows.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const delay = useCallback((ms: number) => new Promise((r) => setTimeout(r, ms)), []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const now = Date.now();
    const since = now - lastSendTime;
    if (since < COOLDOWN_MS) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Cool down... wait ${Math.ceil((COOLDOWN_MS - since) / 1000)}s before sending again.` },
      ]);
      return;
    }
    lastSendTime = now;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Missing API key. Set NEXT_PUBLIC_GEMINI_API_KEY in your .env file." }]);
      setLoading(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${SYSTEM_PROMPT}\n\nUser message: ${text}`,
      });

      const reply = response.text || "Hmm, I couldn't generate a response.";

      if (reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: reply.trim() }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: "I got nothing back — try rephrasing?" }]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        await delay(2000);
        try {
          const ai = new GoogleGenAI({ apiKey });
          const retry = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `${SYSTEM_PROMPT}\n\nUser message: ${text}`,
          });
          const retryReply = retry.text || "Still no luck.";
          setMessages((prev) => [...prev, { role: "assistant", content: retryReply.trim() }]);
        } catch {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Rate limited — try again in a few seconds." },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Something went wrong. Try again later." },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-mint text-black rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(47,243,200,0.3)] hover:brightness-110 active:scale-95 transition-all"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed bottom-24 right-6 z-50 w-full max-w-sm glass-plate rounded-lg flex flex-col overflow-hidden border-mint/20 h-[480px]"
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-mint" />
                <span className="font-headline font-bold text-sm">Nirvana AI</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-on-surface-variant hover:text-mint transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2 rounded-lg text-sm ${
                      msg.role === "user"
                        ? "bg-mint text-black font-mono"
                        : "bg-white/5 text-on-surface font-sans"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 px-4 py-2 rounded-lg">
                    <span className="font-mono text-xs text-mint animate-pulse">thinking...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t border-white/5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about vesting, streams..."
                  className="flex-1 bg-white/3 border border-white/10 rounded-sm px-3 py-2 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-mint/40 transition-colors"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="bg-mint text-black rounded-sm px-3 py-2 hover:brightness-110 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
