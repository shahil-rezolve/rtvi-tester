import { useState } from "react";
import { Send } from "lucide-react";
import { RTVIMessageType, useRTVI } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { sessionStore } from "@/store/sessionStore";

const CLIENT_TYPES = [RTVIMessageType.SEND_TEXT, RTVIMessageType.CLIENT_MESSAGE, RTVIMessageType.APPEND_TO_CONTEXT, RTVIMessageType.CLIENT_READY, RTVIMessageType.DISCONNECT_BOT];

function parseJson(text: string): { value?: unknown; error?: string } {
  if (!text.trim()) return { value: undefined };
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const logOut = (name: string, payload: unknown) => sessionStore.getState().addEvent(`→ ${name}`, [payload], "out");

export function ComposerPanel() {
  const rtvi = useRTVI();
  const [text, setText] = useState("");
  const [msgType, setMsgType] = useState<string>(RTVIMessageType.CLIENT_MESSAGE);
  const [msgData, setMsgData] = useState('{\n  "t": "ping",\n  "d": {}\n}');
  const [raw, setRaw] = useState('{\n  "action": "custom_event"\n}');
  const disabled = !rtvi.isInRoom;

  const msgJson = parseJson(msgData);
  const rawJson = parseJson(raw);
  const rawIsObject = rawJson.value !== null && typeof rawJson.value === "object" && !Array.isArray(rawJson.value);

  const sendText = () => {
    const content = text.trim();
    if (!content) return;
    rtvi.sendClientMessage(RTVIMessageType.SEND_TEXT, { content });
    logOut(RTVIMessageType.SEND_TEXT, { content });
    sessionStore.getState().applyTurn({ type: "textSent", t: Date.now(), text: content });
    setText("");
  };

  return (
    <Tabs defaultValue="text">
      <TabsList className="w-full">
        <TabsTrigger value="text">Text</TabsTrigger>
        <TabsTrigger value="rtvi">RTVI message</TabsTrigger>
        <TabsTrigger value="raw">Raw data</TabsTrigger>
      </TabsList>

      <TabsContent value="text" className="mt-2">
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            sendText();
          }}
        >
          <Input aria-label="Message to the bot" placeholder={disabled ? "Connect to send messages" : "Say something to the bot"} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} />
          <Button type="submit" size="icon" disabled={disabled || !text.trim()} aria-label="Send text">
            <Send />
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="rtvi" className="mt-2 space-y-2">
        <Select value={msgType} onValueChange={setMsgType}>
          <SelectTrigger size="sm" className="w-full font-mono" aria-label="Message type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLIENT_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="font-mono">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea aria-label="Message data (JSON)" value={msgData} onChange={(e) => setMsgData(e.target.value)} spellCheck={false} className="min-h-24 font-mono text-xs" />
        {msgJson.error && <p className="text-xs text-bad">Invalid JSON: {msgJson.error}</p>}
        <Button
          size="sm"
          className="w-full"
          disabled={disabled || !!msgJson.error}
          onClick={() => {
            rtvi.sendClientMessage(msgType, msgJson.value);
            logOut(msgType, msgJson.value ?? null);
          }}
        >
          <Send /> Send {msgType}
        </Button>
      </TabsContent>

      <TabsContent value="raw" className="mt-2 space-y-2">
        <p className="text-xs text-dim">Sent as-is over the data channel, without the RTVI envelope.</p>
        <Textarea aria-label="Raw data (JSON object)" value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} className="min-h-24 font-mono text-xs" />
        {rawJson.error ? <p className="text-xs text-bad">Invalid JSON: {rawJson.error}</p> : !rawIsObject && raw.trim() && <p className="text-xs text-bad">Raw data must be a JSON object.</p>}
        <Button
          size="sm"
          className="w-full"
          disabled={disabled || !rawIsObject}
          onClick={() => {
            rtvi.sendRawData(rawJson.value as Record<string, unknown>);
            logOut("sendRawData", rawJson.value);
          }}
        >
          <Send /> Send raw data
        </Button>
      </TabsContent>
    </Tabs>
  );
}
