"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-300"
  >
    <motion.path
      animate={{ d: isOpen ? "M 6 6 L 18 18" : "M 6 10 L 12 16" }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    />
    <motion.path
      animate={{ d: isOpen ? "M 6 18 L 18 6" : "M 12 16 L 18 10" }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    />
  </svg>
);

export interface DropdownOption {
  id: string;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
}

export interface AnimatedSelectProps {
  placeholder?: string;
  options?: DropdownOption[];
  className?: string;
  width?: number;
  menuMinWidth?: number;
  itemHeight?: number;
  itemGap?: number;
  triggerHeight?: number;
  align?: "start" | "end";
  trigger?: React.ReactNode;
  onSelect?: (option: DropdownOption) => void;
}

export default function AnimatedSelect({
  placeholder = "Select Action",
  options = [],
  className,
  width,
  menuMinWidth,
  itemHeight = 40,
  itemGap = 4,
  triggerHeight = 44,
  align = "start",
  trigger,
  onSelect,
}: AnimatedSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<DropdownOption | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const handleSelect = useCallback(
    (opt: DropdownOption) => {
      setSelected(opt);
      setIsOpen(false);
      if (onSelect) onSelect(opt);
    },
    [onSelect],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-flex flex-col select-none", className)}
      style={width ? { width } : undefined}
    >
      {/* Trigger */}
      <motion.button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={{ width: width ?? "100%", height: triggerHeight }}
        className={cn(
          "relative z-10 flex cursor-pointer items-center justify-between gap-3 border bg-card px-3 text-sm font-semibold tracking-wide text-foreground transition-all duration-200 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-95",
          isOpen ? "rounded-t-xl rounded-b-none" : "rounded-xl",
        )}
      >
        {trigger ?? (
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected ? (
              <>
                <selected.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{selected.label}</span>
              </>
            ) : (
              <span className="font-medium text-muted-foreground">
                {placeholder}
              </span>
            )}
          </span>
        )}
        <ChevronIcon isOpen={isOpen} />
      </motion.button>

      {/* Dropdown panel */}
      <motion.div
        className={cn(
          "pointer-events-none absolute z-50 overflow-hidden rounded-b-xl",
          isOpen
            ? "border-x border-b border-border bg-popover text-popover-foreground shadow-lg"
            : "border-0",
        )}
        style={{
          top: triggerHeight,
          left: align === "end" ? undefined : 0,
          right: align === "end" ? 0 : undefined,
          width: width ?? "100%",
          minWidth: menuMinWidth ?? width ?? 220,
        }}
        initial={false}
        animate={{
          height: isOpen
            ? (itemHeight + itemGap) * options.length + itemGap
            : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ type: "spring", stiffness: 220, damping: 28 }}
      >
        {options.map((opt, i) => (
          <motion.button
            key={opt.id}
            type="button"
            onClick={() => handleSelect(opt)}
            initial={false}
            animate={{
              y: isOpen ? itemGap + i * (itemHeight + itemGap) : 0,
              scale: isOpen ? 1 : 0.8,
              opacity: isOpen ? 1 : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 26,
              delay: isOpen ? i * 0.045 : (options.length - 1 - i) * 0.02,
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 6,
              right: 6,
              height: itemHeight,
              pointerEvents: isOpen ? "auto" : "none",
            }}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors active:scale-95",
              opt.danger
                ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                : "text-foreground hover:bg-muted",
            )}
          >
            <opt.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{opt.label}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
