import { TrashIcon } from "@/shared/ui/Icons";
import type { Layout } from "../domain/types";
import { formatLayoutDimensions } from "../infrastructure/layoutRepository";

function getLayoutSymbolDataUri(layoutOption: Layout): string {
  const symbol = String(layoutOption?.symbol ?? "").trim();
  if (!symbol) return "";
  const normalizedSymbol = symbol.replace(
    /stroke-width=(['"])([\d.]+)\1/g,
    (_match, quote: string, value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return `stroke-width=${quote}${value}${quote}`;
      }
      const thinner = Math.max(0.8, parsed * 0.5);
      return `stroke-width=${quote}${thinner}${quote}`;
    },
  );
  return `data:image/svg+xml;utf8,${encodeURIComponent(normalizedSymbol)}`;
}

interface LayoutCardProps {
  layoutOption: Layout | null;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
  title?: string;
}

export default function LayoutCard({
  layoutOption,
  onClick,
  onDoubleClick,
  onDelete,
  isSelected = false,
  title,
}: LayoutCardProps) {
  if (!layoutOption) {
    return null;
  }
  const className = [
    "layout-card",
    isSelected ? "is-selected" : "",
    onDelete ? "has-delete" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const symbolDataUri = getLayoutSymbolDataUri(layoutOption);
  const sizeText = formatLayoutDimensions(layoutOption);

  const cardButton = (
    <button
      type="button"
      className={className}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-pressed={isSelected}
      title={title}
    >
      <div className="layout-card-copy">
        <p className="layout-card-name">{layoutOption.name}</p>
        <p className="layout-card-meta">{sizeText}</p>
      </div>
      {symbolDataUri ? (
        <img
          className="layout-card-symbol"
          src={symbolDataUri}
          alt={`${layoutOption.name} ratio symbol`}
        />
      ) : null}
    </button>
  );

  if (!onDelete) {
    return cardButton;
  }

  return (
    <div className="layout-card-shell">
      {cardButton}
      <button
        type="button"
        className="layout-card-delete-btn"
        aria-label={`Delete template ${layoutOption.name}`}
        title={`Delete ${layoutOption.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <TrashIcon aria-hidden="true" />
      </button>
    </div>
  );
}
