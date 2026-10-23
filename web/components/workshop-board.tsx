"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function WorkshopBoard({ children }: { children: ReactNode }) {
  const board = useRef<HTMLDivElement>(null),
    scrollbar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const measure = () =>
      setWidth(
        el.scrollWidth -
          el.clientWidth +
          (scrollbar.current?.clientWidth || el.clientWidth),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (scrollbar.current) observer.observe(scrollbar.current);
    for (const child of el.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, []);
  const sync = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (to && Math.abs(to.scrollLeft - from.scrollLeft) > 1)
      to.scrollLeft = from.scrollLeft;
  };
  return (
    <div className="ws-board-frame">
      <div
        className="ws-board-navigation"
        role="group"
        aria-label="Navegação horizontal do Kanban"
      >
        <button
          type="button"
          aria-label="Colunas anteriores"
          onClick={() =>
            board.current?.scrollBy({ left: -280, behavior: "smooth" })
          }
        >
          <ArrowLeft size={17} />
        </button>
        <div
          ref={scrollbar}
          className="ws-board-top-scroll"
          tabIndex={0}
          role="region"
          aria-label="Rolar colunas do Kanban"
          onScroll={(e) => sync(e.currentTarget, board.current)}
        >
          <div style={{ width, height: 1 }} />
        </div>
        <button
          type="button"
          aria-label="Próximas colunas"
          onClick={() =>
            board.current?.scrollBy({ left: 280, behavior: "smooth" })
          }
        >
          <ArrowRight size={17} />
        </button>
      </div>
      <div
        className="ws-board"
        ref={board}
        onScroll={(e) => sync(e.currentTarget, scrollbar.current)}
      >
        {children}
      </div>
    </div>
  );
}
