"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SearchSelect — custom select dropdown dengan search/filter input.
 *
 * API kompatibel dengan `<Select>` (dan native `<select>`), jadi bisa
 * langsung jadi drop-in replacement.
 *
 * Cara kerja:
 *  1. Trigger button menampilkan nilai terpilih (atau placeholder).
 *  2. Klik trigger → popover terbuka dengan search input di bagian atas.
 *  3. User mengetik → daftar option difilter secara real-time.
 *  4. Klik option → commit nilai & tutup popover.
 */

type Option = {
  value: string;
  label: React.ReactNode;
  /** Plain text dari label, dipakai untuk search & rendering trigger. */
  text: string;
  disabled: boolean;
};

function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return nodeText(props.children);
  }
  return "";
}

function flattenOptions(children: React.ReactNode): Option[] {
  const out: Option[] = [];
  React.Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      const props = child.props as { children?: React.ReactNode };
      out.push(...flattenOptions(props.children));
      return;
    }
    if (child.type === "option") {
      const props = child.props as {
        value?: string | number | readonly string[];
        disabled?: boolean;
        children?: React.ReactNode;
      };
      const rawValue = props.value;
      const value =
        rawValue == null ? nodeText(props.children) : String(rawValue);
      out.push({
        value,
        label: props.children,
        text: nodeText(props.children),
        disabled: !!props.disabled,
      });
      return;
    }
  });
  return out;
}

type SearchSelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> & {
  /** Placeholder dipakai bila tidak ada option dengan value "". */
  placeholder?: string;
  /** Placeholder untuk search input di dalam popover. */
  searchPlaceholder?: string;
  /** Pesan bila tidak ada hasil pencarian. */
  noResultsMessage?: string;
};

const SearchSelect = React.forwardRef<HTMLSelectElement, SearchSelectProps>(
  function SearchSelect(
    {
      className,
      children,
      value: controlledValue,
      defaultValue,
      onChange,
      onBlur,
      onFocus,
      disabled,
      name,
      id,
      required,
      placeholder,
      searchPlaceholder = "Cari…",
      noResultsMessage = "Tidak ditemukan",
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      "aria-describedby": ariaDescribedBy,
      ...rest
    },
    forwardedRef,
  ) {
    const options = React.useMemo(() => flattenOptions(children), [children]);

    // Controlled vs uncontrolled.
    const isControlled = controlledValue !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState<string>(
      () => {
        if (defaultValue !== undefined) return String(defaultValue);
        const first = options.find((o) => !o.disabled);
        return first?.value ?? "";
      },
    );
    const currentValue = isControlled
      ? String(controlledValue)
      : uncontrolledValue;

    const selectedOption = options.find((o) => o.value === currentValue);
    const listboxId = React.useId();

    // Refs
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const popoverRef = React.useRef<HTMLDivElement | null>(null);
    const searchInputRef = React.useRef<HTMLInputElement | null>(null);
    const hiddenSelectRef = React.useRef<HTMLSelectElement | null>(null);

    React.useImperativeHandle(forwardedRef, () => hiddenSelectRef.current!, []);

    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const [highlight, setHighlight] = React.useState<number>(-1);
    const [coords, setCoords] = React.useState<{
      top: number;
      left: number;
      width: number;
      placeAbove: boolean;
    } | null>(null);

    // Filtered options berdasarkan search
    const filteredOptions = React.useMemo(() => {
      if (!search) return options;
      const q = search.toLowerCase();
      return options.filter((o) => o.text.toLowerCase().includes(q));
    }, [options, search]);

    const updateCoords = React.useCallback(() => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const viewportH = window.innerHeight;
      const spaceBelow = viewportH - rect.bottom;
      const desired = Math.min(320, filteredOptions.length * 36 + 64);
      const placeAbove = spaceBelow < desired + margin && rect.top > spaceBelow;
      setCoords({
        top: placeAbove ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        placeAbove,
      });
    }, [filteredOptions.length]);

    const openPopover = React.useCallback(() => {
      if (disabled) return;
      updateCoords();
      setSearch("");
      const idx = options.findIndex((o) => o.value === currentValue);
      setHighlight(idx >= 0 ? idx : 0);
      setOpen(true);
      // Focus search input setelah popover terbuka
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }, [currentValue, disabled, options, updateCoords]);

    const closePopover = React.useCallback(() => {
      setOpen(false);
    }, []);

    // Reposition saat scroll / resize.
    React.useEffect(() => {
      if (!open) return;
      updateCoords();
      const onScrollOrResize = () => updateCoords();
      window.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
      return () => {
        window.removeEventListener("scroll", onScrollOrResize, true);
        window.removeEventListener("resize", onScrollOrResize);
      };
    }, [open, updateCoords]);

    // Outside click.
    React.useEffect(() => {
      if (!open) return;
      const onPointer = (e: MouseEvent) => {
        const t = e.target as Node;
        if (popoverRef.current?.contains(t)) return;
        if (triggerRef.current?.contains(t)) return;
        closePopover();
      };
      document.addEventListener("mousedown", onPointer);
      return () => document.removeEventListener("mousedown", onPointer);
    }, [open, closePopover]);

    // Reset highlight saat search berubah
    React.useEffect(() => {
      if (!open) return;
      setHighlight(filteredOptions.length > 0 ? 0 : -1);
    }, [search, filteredOptions.length, open]);

    const commit = React.useCallback(
      (next: string) => {
        if (next === currentValue) {
          closePopover();
          return;
        }
        if (!isControlled) setUncontrolledValue(next);
        const el = hiddenSelectRef.current;
        if (el) el.value = next;
        if (onChange) {
          const fakeTarget = {
            value: next,
            name: name ?? "",
          } as unknown as HTMLSelectElement;
          const fakeEvent = {
            target: fakeTarget,
            currentTarget: fakeTarget,
            preventDefault: () => {},
            stopPropagation: () => {},
            isDefaultPrevented: () => false,
            isPropagationStopped: () => false,
            persist: () => {},
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            eventPhase: 0,
            isTrusted: false,
            nativeEvent: new Event("change"),
            timeStamp: Date.now(),
            type: "change",
          } as unknown as React.ChangeEvent<HTMLSelectElement>;
          onChange(fakeEvent);
        }
        closePopover();
        triggerRef.current?.focus();
      },
      [currentValue, isControlled, name, onChange, closePopover],
    );

    const moveHighlight = React.useCallback(
      (dir: 1 | -1) => {
        const len = filteredOptions.length;
        if (len === 0) return;
        let idx = Math.max(0, highlight);
        for (let i = 0; i < len; i += 1) {
          idx = (idx + dir + len) % len;
          if (!filteredOptions[idx].disabled) {
            setHighlight(idx);
            return;
          }
        }
      },
      [highlight, filteredOptions],
    );

    const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (!open) {
        if (
          e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "Enter" ||
          e.key === " "
        ) {
          e.preventDefault();
          openPopover();
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // Buka langsung dan mulai search
          e.preventDefault();
          openPopover();
          // search input akan fokus otomatis
        }
        return;
      }
      // open === true — handle di search input keydown
      // (kita hanya handle Escape & Tab di sini untuk fallback)
      if (e.key === "Escape") {
        e.preventDefault();
        closePopover();
        triggerRef.current?.focus();
      }
      if (e.key === "Tab") {
        closePopover();
      }
    };

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveHighlight(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveHighlight(-1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const o = filteredOptions[highlight];
        if (o && !o.disabled) {
          commit(o.value);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePopover();
        triggerRef.current?.focus();
      }
      // Jangan stopPropagation untuk typing biasa
    };

    // Scroll item yang disorot ke viewport
    React.useEffect(() => {
      if (!open) return;
      const root = popoverRef.current;
      if (!root) return;
      const item = root.querySelector<HTMLElement>(
        `[data-index="${highlight}"]`,
      );
      item?.scrollIntoView({ block: "nearest" });
    }, [highlight, open]);

    const triggerLabel = selectedOption?.text || placeholder || "";
    const triggerLabelNode =
      selectedOption &&
      !(selectedOption.value === "" && selectedOption.disabled)
        ? selectedOption.label
        : (placeholder ?? selectedOption?.label ?? "");
    const isPlaceholderSelected =
      !selectedOption ||
      (selectedOption.value === "" && selectedOption.disabled) ||
      !triggerLabel;

    return (
      <div className={cn("relative", disabled && "pointer-events-none")}>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-disabled={disabled || undefined}
          disabled={disabled}
          onClick={() => (open ? closePopover() : openPopover())}
          onKeyDown={onTriggerKeyDown}
          onBlur={
            onBlur as unknown as React.FocusEventHandler<HTMLButtonElement>
          }
          onFocus={
            onFocus as unknown as React.FocusEventHandler<HTMLButtonElement>
          }
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 pr-10 text-left text-base text-foreground transition-colors",
            "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30",
            "disabled:cursor-not-allowed disabled:opacity-60",
            isPlaceholderSelected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{triggerLabelNode}</span>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
        </button>

        {/* Hidden real <select> */}
        <select
          ref={hiddenSelectRef}
          name={name}
          required={required}
          disabled={disabled}
          value={currentValue}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
          {...rest}
        >
          {children}
        </select>

        {open && coords
          ? createPortal(
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Pencarian"
                className={cn(
                  "fixed z-[100] max-h-[320px] overflow-hidden rounded-md border border-border bg-popover shadow-lg ring-1 ring-black/5 dark:ring-white/10",
                )}
                style={{
                  top: coords.placeAbove ? undefined : coords.top,
                  bottom: coords.placeAbove
                    ? window.innerHeight - coords.top
                    : undefined,
                  left: coords.left,
                  width: Math.max(coords.width, 240),
                  minWidth: Math.max(coords.width, 240),
                }}
              >
                {/* Search input */}
                <div className="sticky top-0 z-10 border-b bg-popover p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.currentTarget.value)}
                      onKeyDown={onSearchKeyDown}
                      placeholder={searchPlaceholder}
                      className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
                      autoComplete="off"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          searchInputRef.current?.focus();
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                        aria-label="Hapus pencarian"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Options list */}
                <div
                  id={listboxId}
                  role="listbox"
                  className="overflow-auto p-1"
                  style={{ maxHeight: 240 }}
                >
                  {filteredOptions.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      {noResultsMessage}
                    </div>
                  ) : (
                    filteredOptions.map((o, idx) => {
                      const isSelected = o.value === currentValue;
                      const isHighlighted = idx === highlight;
                      return (
                        <div
                          key={`${o.value}-${idx}`}
                          data-index={idx}
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={o.disabled || undefined}
                          onMouseEnter={() => !o.disabled && setHighlight(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (o.disabled) return;
                            commit(o.value);
                          }}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5",
                            o.disabled && "cursor-not-allowed opacity-50",
                            !o.disabled &&
                              isHighlighted &&
                              "bg-accent text-accent-foreground",
                          )}
                        >
                          <span className="truncate">{o.label}</span>
                          {isSelected ? (
                            <Check className="h-4 w-4 flex-shrink-0 opacity-70" />
                          ) : null}
                        </div>
                      );
                    })
                  )}
                  <div className="h-2" />
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

export { SearchSelect };
export type { SearchSelectProps };
