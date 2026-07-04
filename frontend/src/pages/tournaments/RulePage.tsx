import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  TOURNAMENT_PAGE_BG_CLASS,
  TOURNAMENT_PAGE_TITLE_CLASS,
  TOURNAMENT_PANEL_CLASS,
} from "@/components/tournamentTheme";

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

type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

const parseContentBlocks = (content?: string): ContentBlock[] => {
  const lines = String(content ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: ContentBlock[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (!currentList.length) return;
    blocks.push({ type: "list", items: [...currentList] });
    currentList = [];
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      currentList.push(bulletMatch[1]);
      continue;
    }

    flushList();
    blocks.push({ type: "paragraph", text: line });
  }

  flushList();
  return blocks;
};

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
    <div className={`space-y-4 ${TOURNAMENT_PAGE_BG_CLASS}`}>
      <h2 className={TOURNAMENT_PAGE_TITLE_CLASS}>Luật thi đấu</h2>

      <div className={`overflow-hidden ${TOURNAMENT_PANEL_CLASS} text-neutral-100`}>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 /20 p-4 lg:border-b-0 lg:border-r lg:p-5">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">
              Mục lục
            </p>
            <div className="space-y-1.5">
              {rules.map((rule, index) => (
                <button
                  key={String(rule.id)}
                  type="button"
                  onClick={() => scrollToRule(index)}
                  className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors ${
                    activeIndex === index
                      ? "bg-[#2d2d2d] text-white"
                      : "text-neutral-300 hover:bg-[#1c1c1c]"
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
                const blocks = parseContentBlocks(rule.content);

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
                      {blocks.map((block, blockIndex) =>
                        block.type === "paragraph" ? (
                          <p key={`${rule.id}-p-${blockIndex}`}>{block.text}</p>
                        ) : (
                          <ul
                            key={`${rule.id}-ul-${blockIndex}`}
                            className="list-disc space-y-1.5 pl-5 text-zinc-100/90"
                          >
                            {block.items.map((item, itemIndex) => (
                              <li key={`${rule.id}-li-${blockIndex}-${itemIndex}`}>
                                {item}
                              </li>
                            ))}
                          </ul>
                        ),
                      )}
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
