"use client";

import { useEffect, useRef } from "react";
import { PostflopRangeGrid } from "@/components/PostflopStrategy/PostflopRangeGrid";
import { BetSizeFilterBar } from "@/components/PostflopStrategy/BetSizeFilterBar";
import { SuitedComboBreakdown } from "@/components/PostflopStrategy/SuitedComboBreakdown";
import { buildActionColorScale } from "@/components/PostflopStrategy/postflopColorLegend";
import type { SerializedCombo, SerializedDecisionNode } from "@/types/postflopSolver";

interface DecisionStrategyViewProps {
  node: SerializedDecisionNode;
  /** The acting player's range arriving at this node. */
  range: SerializedCombo[];
  board: string[];
  heroLabel: string;
  villainLabel: string;
  selectedHand: string | null;
  onSelectHand: (hand: string | null) => void;
  isolatedActionIndex: number | null;
  onIsolateChange: (index: number | null) => void;
}

/** A decision node's strategy: the size filter and range grid, with the selected hand's combos beside them. */
export function DecisionStrategyView(props: DecisionStrategyViewProps) {
  const { node, range, selectedHand } = props;
  const colors = buildActionColorScale(node.actions);

  // Below the chart on small screens, a tapped hand's combos would otherwise sit off-screen.
  const comboDetailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedHand && !window.matchMedia?.("(min-width: 1024px)").matches) {
      comboDetailRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedHand]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-2 lg:min-h-0">
        <BetSizeFilterBar
          node={node}
          range={range}
          colors={colors}
          isolatedActionIndex={props.isolatedActionIndex}
          onIsolateChange={props.onIsolateChange}
        />
        <div className="lg:min-h-0 lg:flex-1">
          <PostflopRangeGrid
            range={range}
            node={node}
            colors={colors}
            isolatedActionIndex={props.isolatedActionIndex}
            selectedHand={selectedHand}
            onSelectHand={props.onSelectHand}
          />
        </div>
      </div>
      <div
        ref={comboDetailRef}
        className="flex flex-col gap-3 border-t border-line pt-3 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
      >
        <SuitedComboBreakdown
          selectedHand={selectedHand}
          node={node}
          range={range}
          board={props.board}
          colors={colors}
          heroLabel={props.heroLabel}
          villainLabel={props.villainLabel}
        />
      </div>
    </div>
  );
}
