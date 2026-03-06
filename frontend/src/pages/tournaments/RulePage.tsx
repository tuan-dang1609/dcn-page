import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

type RuleItem = {
  id?: number | string;
  title?: string;
  content?: string;
};

type RuleOutletContext = {
  tournament?: {
    rule?: RuleItem[];
  };
};

const toLines = (content?: string) =>
  String(content ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const RulePage = () => {
  const { tournament } = useOutletContext<RuleOutletContext>();
  const [activeIndex, setActiveIndex] = useState(0);

  const rules = useMemo(() => {
    const source = tournament?.rule ?? [];

    return source.map((rule, index) => ({
      id: rule.id ?? `rule-${index + 1}`,
      title: String(rule.title ?? `Mục ${index + 1}`),
      content: String(rule.content ?? ""),
    }));
  }, [tournament?.rule]);

  const scrollToRule = (index: number) => {
    const node = document.getElementById(`rule-section-${index}`);
    if (!node) return;

    setActiveIndex(index);
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-heading">Luật thi đấu</h2>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#120c10] text-zinc-100">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 bg-black/20 p-4 lg:border-b-0 lg:border-r lg:p-5">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">
              Mục lục
            </p>
            <div className="space-y-1.5">
              {rules.map((rule, index) => (
                <button
                  key={String(rule.id)}
                  type="button"
                  onClick={() => scrollToRule(index)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                    activeIndex === index
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <span className="w-5 text-zinc-500">{index + 1}.</span>
                  <span className="line-clamp-1">{rule.title}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="max-h-[72vh] overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="space-y-8">
              {rules.map((rule, index) => {
                const lines = toLines(rule.content);
                const bulletLines = lines.filter((line) =>
                  /^[-*•]\s+/.test(line),
                );
                const normalLines = lines.filter(
                  (line) => !/^[-*•]\s+/.test(line),
                );

                return (
                  <section
                    key={String(rule.id)}
                    id={`rule-section-${index}`}
                    className="scroll-mt-24"
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <h3 className="text-2xl font-semibold leading-tight text-zinc-100">
                      {index + 1}. {rule.title}
                    </h3>
                    <div className="mt-2 h-px w-full bg-white/15" />

                    <div className="mt-3 space-y-3 text-[17px] leading-relaxed text-zinc-200/95">
                      {normalLines.map((line, lineIndex) => (
                        <p key={`${rule.id}-p-${lineIndex}`}>{line}</p>
                      ))}

                      {bulletLines.length > 0 ? (
                        <ul className="list-disc space-y-1.5 pl-5 text-zinc-100/90">
                          {bulletLines.map((line, lineIndex) => (
                            <li key={`${rule.id}-li-${lineIndex}`}>
                              {line.replace(/^[-*•]\s+/, "")}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default RulePage;
