import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type AutoFitContentProps = {
  children: ReactNode;
  className?: string;
};

const SCALE_EPSILON = 0.001;

const AutoFitContent = ({ children, className }: AutoFitContentProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  const recalc = () => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const containerWidth = container.clientWidth;
    const contentWidth = content.scrollWidth;
    const contentHeight = content.scrollHeight;

    if (!containerWidth || !contentWidth) {
      setScale(1);
      setHeight(contentHeight || null);
      return;
    }

    const nextScale = Math.min(1, containerWidth / contentWidth);
    setScale((prev) =>
      Math.abs(prev - nextScale) > SCALE_EPSILON ? nextScale : prev,
    );
    setHeight(contentHeight * nextScale);
  };

  useLayoutEffect(() => {
    recalc();
  }, [children]);

  useEffect(() => {
    recalc();

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      recalc();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        overflow: "hidden",
        height: height ? `${height}px` : undefined,
      }}
    >
      <div
        ref={contentRef}
        style={{
          width: "max-content",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default AutoFitContent;
