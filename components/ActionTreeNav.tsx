import type { ManifestNode } from "@/types/rangeData";

interface ActionTreeNavProps {
  nodes: ManifestNode[];
  currentNodeId: string | null;
  onNavigate: (nodeId: string) => void;
}

/**
 * A node is a "root" for this hero/stack group if its declared parent isn't
 * actually present in the group — e.g. a BB vs-4bet node whose parent decision
 * (the opener's 4-bet) belongs to a different hero position's tree entirely,
 * so BB genuinely has several independent entry-point scenarios rather than
 * one single tree.
 */
function getRoots(nodes: ManifestNode[]): ManifestNode[] {
  const ids = new Set(nodes.map((n) => n.nodeId));
  return nodes.filter((n) => n.parentNodeId === null || !ids.has(n.parentNodeId));
}

function getChildren(nodes: ManifestNode[], parentNodeId: string): ManifestNode[] {
  return nodes.filter((n) => n.parentNodeId === parentNodeId);
}

function getBreadcrumb(nodes: ManifestNode[], nodeId: string): ManifestNode[] {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const path: ManifestNode[] = [];
  let current = byId.get(nodeId);
  while (current) {
    path.unshift(current);
    current = current.parentNodeId ? byId.get(current.parentNodeId) : undefined;
  }
  return path;
}

export function ActionTreeNav({ nodes, currentNodeId, onNavigate }: ActionTreeNavProps) {
  const roots = getRoots(nodes);
  const breadcrumb = currentNodeId ? getBreadcrumb(nodes, currentNodeId) : [];
  const currentRootId = breadcrumb[0]?.nodeId;
  const children = currentNodeId ? getChildren(nodes, currentNodeId) : [];

  return (
    <div className="flex flex-col gap-2">
      {roots.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {roots.map((node) => (
            <button
              key={node.nodeId}
              type="button"
              onClick={() => onNavigate(node.nodeId)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium ${
                node.nodeId === currentRootId
                  ? "bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {node.label}
            </button>
          ))}
        </div>
      )}

      {breadcrumb.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
          {breadcrumb.map((node, i) => (
            <span key={node.nodeId} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <button
                type="button"
                onClick={() => onNavigate(node.nodeId)}
                className={
                  node.nodeId === currentNodeId
                    ? "font-semibold text-zinc-900 dark:text-zinc-100"
                    : "hover:underline"
                }
              >
                {node.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {children.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {children.map((node) => (
            <button
              key={node.nodeId}
              type="button"
              onClick={() => onNavigate(node.nodeId)}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {node.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
