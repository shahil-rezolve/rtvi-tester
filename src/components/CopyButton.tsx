import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Button variant="ghost" size="xs" onClick={copy} className={className} aria-label={label}>
      {copied ? <Check className="text-ok" /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
