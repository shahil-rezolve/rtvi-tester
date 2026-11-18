import { JsonView, defaultStyles, collapseAllNested } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

const style = {
  ...defaultStyles,
  container: "jt font-mono text-xs leading-5",
  label: "jt-label",
  stringValue: "jt-string",
  numberValue: "jt-number",
  booleanValue: "jt-bool",
  nullValue: "jt-null",
  undefinedValue: "jt-null",
  otherValue: "jt-null",
  punctuation: "jt-punct",
};

export function JsonTree({ data, expandAll = false }: { data: unknown; expandAll?: boolean }) {
  if (data === null || typeof data !== "object") {
    return <pre className="font-mono text-xs whitespace-pre-wrap break-all">{JSON.stringify(data)}</pre>;
  }
  return <JsonView data={data as object} style={style} shouldExpandNode={expandAll ? () => true : (lvl) => collapseAllNested(lvl) || lvl < 2} />;
}
