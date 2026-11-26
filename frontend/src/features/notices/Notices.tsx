import Markdown from "react-markdown";
import { usePlan } from "../../stores/planStore.ts";

const Link = (props: React.ComponentProps<"a">) => <a {...props} target="_blank" rel="noopener noreferrer" />;

export function Notices() {
  const notices = usePlan((s) => s.notices);
  if (!notices.length) return <p className="empty-note">ยังไม่มีประกาศ</p>;
  return (
    <div className="notice-list">
      {notices.map((text) => (
        <article key={text.slice(0, 40)} className="notice panel">
          <Markdown components={{ a: Link }}>{text}</Markdown>
        </article>
      ))}
    </div>
  );
}
