import { useMessages } from "@/lib/i18n/locale";

const CELLS = Array.from({ length: 169 }, (_, i) => i);
const GRID_STYLE = {
  gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
  gridTemplateRows: "repeat(13, minmax(0, 1fr))",
};

/**
 * The range chart's outline while its first numbers load, sized like
 * HandMatrixGrid and the rows above it so nothing jumps when they arrive.
 */
export function GridSkeleton() {
  const t = useMessages();
  return (
    <section role="status" className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <span className="sr-only">{t.common.loading}</span>
      <div aria-hidden="true" className="h-4" />
      <div aria-hidden="true" className="h-[62px] rounded bg-sunken" />
      <div aria-hidden="true" className="lg:min-h-0 lg:flex-1">
        <div
          className="mx-auto grid aspect-square w-full max-w-[100dvh] gap-[2px] lg:mx-0 lg:aspect-auto lg:h-full lg:min-h-0 lg:max-w-none"
          style={GRID_STYLE}
        >
          {CELLS.map((i) => (
            <div key={i} className="rounded-[2px] bg-sunken" />
          ))}
        </div>
      </div>
    </section>
  );
}
