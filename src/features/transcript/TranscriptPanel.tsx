import { useEffect, useRef } from "react";
import { useSession } from "@/store/sessionStore";

export function TranscriptPanel() {
  const turns = useSession((s) => s.turns);
  const interim = useSession((s) => s.interim);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, interim]);

  if (!turns.length && !interim) return <p className="p-6 text-xs text-dim">The conversation shows up here once someone speaks or you send a text message.</p>;

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <ol className="mx-auto max-w-3xl space-y-3 text-[13px] leading-relaxed">
        {turns.map((turn) => (
          <li key={turn.id} className="space-y-1">
            {turn.userText && (
              <p>
                <span className="mr-2 font-medium text-user">You{turn.source === "text" ? " (typed)" : ""}</span>
                {turn.userText}
              </p>
            )}
            {turn.botText && (
              <p>
                <span className="mr-2 font-medium text-bot">Bot</span>
                {turn.botText}
              </p>
            )}
          </li>
        ))}
        {interim && (
          <li className="text-dim italic">
            <span className="mr-2 font-medium text-user not-italic">You (listening)</span>
            {interim}
          </li>
        )}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
