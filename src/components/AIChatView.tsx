"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState, useRef, useEffect } from "react";

interface Props {
  deviceId?: string;
  lat?: number | null;
  lng?: number | null;
}

export default function AIChatView({ deviceId, lat, lng }: Props) {
  const { getAccessTokenSilently } = useAuth0();
  const authenticatedFetch = useAuthenticatedFetch();
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat", headers: async () => ({ Authorization: `Bearer ${await getAccessTokenSilently()}` }) }),
    messages: [
      {
        id: "system-intro",
        role: "assistant" as const,
        parts: [
          {
            type: "text" as const,
            text: `Hi! I'm **Bair**, your AI air quality assistant. I can help you with:\n\n- Real-time sensor readings\n- Air quality comparisons (sensor vs Google)\n- Weather & pollen data\n- Health recommendations\n\nTry: *"How's the air quality right now?"* or *"Compare my sensor to Google AQI"*`,
          },
        ],
      },
    ] satisfies UIMessage[],
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage({ text });
  };

  const playBriefing = async () => {
    setIsVoicePlaying(true);
    setBriefingText(null);
    try {
      const params = new URLSearchParams();
      if (deviceId) params.set("deviceId", deviceId);
      if (lat != null) params.set("lat", String(lat));
      if (lng != null) params.set("lng", String(lng));

      const res = await authenticatedFetch(`/api/voice/briefing?${params}`);
      const data = await res.json();
      setBriefingText(data.text);

      if (data.audio) {
        const audio = new Audio(data.audio);
        audioRef.current = audio;
        audio.onended = () => setIsVoicePlaying(false);
        audio.play();
      } else {
        setIsVoicePlaying(false);
      }
    } catch {
      setIsVoicePlaying(false);
    }
  };

  const sendQuickPrompt = async (prompt: string) => {
    if (isLoading) return;
    await sendMessage({ text: prompt });
  };

  const quickPrompts = [
    { label: "Current AQI", prompt: deviceId ? `What's the current AQI from sensor ${deviceId}?` : "What's the air quality like?" },
    { label: "Compare sources", prompt: deviceId && lat ? `Compare sensor ${deviceId} readings with Google Air Quality API at ${lat}, ${lng}` : "Compare sensor vs Google AQI" },
    { label: "Health advice", prompt: "Give me health recommendations based on current conditions" },
    { label: "Weather impact", prompt: lat ? `How is the weather at ${lat}, ${lng} affecting air quality?` : "How is weather affecting air quality?" },
  ];

  const getMessageText = (msg: typeof messages[0]): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  };

  return (
    <div className="tab-content-enter flex flex-col h-[calc(100vh-180px)]">
      {/* Voice briefing button */}
      <div className="px-4 mb-3">
        <button
          onClick={playBriefing}
          disabled={isVoicePlaying}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all ${
            isVoicePlaying
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-primary text-white hover:bg-primary-hover"
          }`}
        >
          {isVoicePlaying ? (
            <>
              <span className="flex gap-0.5">
                <span className="w-1 h-4 bg-primary rounded-full animate-pulse" />
                <span className="w-1 h-3 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
                <span className="w-1 h-5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
                <span className="w-1 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0.45s" }} />
              </span>
              Playing briefing...
            </>
          ) : (
            <>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              Voice Briefing
            </>
          )}
        </button>
        {briefingText && !isVoicePlaying && (
          <div className="mt-2 bg-surface border border-border rounded-xl p-3 text-xs text-ink/80">
            {briefingText}
          </div>
        )}
      </div>

      {/* Quick prompts */}
      <div className="px-4 mb-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {quickPrompts.map((qp) => (
          <button
            key={qp.label}
            onClick={() => sendQuickPrompt(qp.prompt)}
            className="shrink-0 bg-surface border border-border rounded-full px-3 py-1.5 text-xs text-muted hover:text-ink hover:border-primary/50 transition-colors"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3">
        {messages.map((m) => {
          const text = getMessageText(m);
          if (!text) return null;
          return (
            <div
              key={m.id}
              className={`flex ${(m.role as string) === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  (m.role as string) === "user"
                    ? "bg-primary text-white rounded-br-sm"
                    : "bg-surface border border-border text-ink rounded-bl-sm"
                }`}
              >
                {m.role === "assistant" ? (
                  <div
                    className="prose prose-sm prose-invert max-w-none [&_p]:mb-1.5 [&_p]:last:mb-0"
                    dangerouslySetInnerHTML={{ __html: simpleMarkdown(text) }}
                  />
                ) : (
                  text
                )}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="w-2 h-2 bg-muted rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-border bg-bg/80 backdrop-blur"
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about air quality..."
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:border-primary/50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-primary-hover transition-colors"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="bg-border/50 px-1 rounded text-xs">$1</code>')
    .replace(/\n- /g, "<br/>- ")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");
}
