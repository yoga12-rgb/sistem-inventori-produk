"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom <Select> dengan API persis seperti native `<select>` (drop-in).
 *
 * Kenapa custom dan bukan native <select>?
 *  - Native dropdown OS render di layer yang lebih tinggi dari semua elemen
 *    HTML, sehingga tidak bisa ditimpa tooltip / overlay React (misal tooltip
 *    sidebar collapsed). Custom popover di portal bisa diatur z-index-nya.
 *
 * Bagaimana cara menjaga API kompatibel:
 *  - Children tetap `<option value="...">label</option>` apa adanya.
 *  - `onChange` dipanggil dengan event-like yang punya `currentTarget.value`
 *    & `target.value` (sesuai pola pemakai existing).
 *  - Hidden `<select>` real masih dirender (off-screen + opacity 0 + tabindex
 *    -1), supaya form submission, `name`, `required`, dan ref tetap bekerja.
 */

type Option = {
  value: string;
  label: React.ReactNode;
  /** Plain text dari label, dipakai untuk type-ahead & rendering trigger. */
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
    // Optgroup atau elemen lain di-skip (project tidak memakainya).
  });
  return out;
}

type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> & {
  /** Placeholder dipakai bila tidak ada option dengan value "". */
  placeholder?: string;
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
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
      // Default ke option pertama yang tidak disabled (perilaku native).
      const first = options.find((o) => !o.disabled);
      return first?.value ?? "";
    },
  );
  const currentValue = isControlled
    ? String(controlledValue)
    : uncontrolledValue;

  const selectedOption = options.find((o) => o.value === currentValue);

  // Refs ke trigger & popover untuk positioning + outside click.
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const hiddenSelectRef = React.useRef<HTMLSelectElement | null>(null);

  // Forward ref ke hidden <select> untuk kompatibilitas (dipakai bila
  // ada konsumen yang mau attach ref di kemudian hari).
  React.useImperativeHandle(forwardedRef, () => hiddenSelectRef.current!, []);

  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState<number>(-1);
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
    width: number;
    placeAbove: boolean;
  } | null>(null);

  const updateCoords = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom;
    const desired = Math.min(280, options.length * 36 + 8);
    const placeAbove = spaceBelow < desired + margin && rect.top > spaceBelow;
    setCoords({
      top: placeAbove ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      placeAbove,
    });
  }, [options.length]);

  // Buka popover & set highlight ke option terpilih.
  const openPopover = React.useCallback(() => {
    if (disabled) return;
    updateCoords();
    const idx = options.findIndex((o) => o.value === currentValue);
    setHighlight(idx >= 0 ? idx : options.findIndex((o) => !o.disabled));
    setOpen(true);
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

  // Apply nilai baru: update state lokal + panggil onChange dengan event-like
  // yang menyerupai React.ChangeEvent<HTMLSelectElement>.
  const commit = React.useCallback(
    (next: string) => {
      if (next === currentValue) return;
      if (!isControlled) setUncontrolledValue(next);
      const el = hiddenSelectRef.current;
      if (el) {
        // Set value pada hidden select agar pemakai yang membaca via ref
        // mendapatkan value terbaru.
        el.value = next;
      }
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
    },
    [currentValue, isControlled, name, onChange],
  );

  const moveHighlight = React.useCallback(
    (dir: 1 | -1) => {
      if (options.length === 0) return;
      let idx = highlight;
      for (let i = 0; i < options.length; i += 1) {
        idx = (idx + dir + options.length) % options.length;
        if (!options[idx].disabled) {
          setHighlight(idx);
          return;
        }
      }
    },
    [highlight, options],
  );

  // Type-ahead: kumpulkan keystroke dlm 600ms, cari option yang text-nya
  // diawali oleh string ini.
  const typeAheadRef = React.useRef<{ buf: string; t: number }>({
    buf: "",
    t: 0,
  });
  const handleTypeAhead = React.useCallback(
    (key: string) => {
      const now = Date.now();
      if (now - typeAheadRef.current.t > 600) typeAheadRef.current.buf = "";
      typeAheadRef.current.buf += key.toLowerCase();
      typeAheadRef.current.t = now;
      const buf = typeAheadRef.current.buf;
      const startFrom = highlight >= 0 ? highlight + 1 : 0;
      for (let i = 0; i < options.length; i += 1) {
        const idx = (startFrom + i) % options.length;
        const o = options[idx];
        if (o.disabled) continue;
        if (o.text.toLowerCase().startsWith(buf)) {
          setHighlight(idx);
          return;
        }
      }
    },
    [highlight, options],
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
      // Type-ahead saat tertutup hanya menyorot, popover dibuka dulu.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openPopover();
        handleTypeAhead(e.key);
      }
      return;
    }
    // open === true
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveHighlight(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveHighlight(-1);
        break;
      case "Home":
        e.preventDefault();
        for (let i = 0; i < options.length; i += 1) {
          if (!options[i].disabled) {
            setHighlight(i);
            break;
          }
        }
        break;
      case "End":
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i -= 1) {
          if (!options[i].disabled) {
            setHighlight(i);
            break;
          }
        }
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const o = options[highlight];
        if (o && !o.disabled) {
          commit(o.value);
          closePopover();
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        closePopover();
        break;
      case "Tab":
        closePopover();
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          handleTypeAhead(e.key);
        }
        break;
    }
  };

  // Scroll item yang disorot ke viewport popover.
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
    selectedOption && !(selectedOption.value === "" && selectedOption.disabled)
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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open && id ? `${id}-listbox` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={() => (open ? closePopover() : openPopover())}
        onKeyDown={onTriggerKeyDown}
        onBlur={onBlur as unknown as React.FocusEventHandler<HTMLButtonElement>}
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

      {/*
        Hidden real <select> — render di luar layout (off-screen) tapi tetap
        ada di DOM agar:
        - form submission menyertakan name & value;
        - validasi `required` native tetap berjalan;
        - ref ke HTMLSelectElement tetap valid bagi konsumen.
      */}
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
              role="listbox"
              id={id ? `${id}-listbox` : undefined}
              className={cn(
                "fixed z-[100] max-h-[280px] overflow-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10",
              )}
              style={{
                top: coords.placeAbove ? undefined : coords.top,
                bottom: coords.placeAbove
                  ? window.innerHeight - coords.top
                  : undefined,
                left: coords.left,
                width: coords.width,
                minWidth: coords.width,
              }}
            >
              {options.length === 0 ? (
                <div className="px-2 py-1.5 text-muted-foreground">
                  Tidak ada pilihan
                </div>
              ) : (
                options.map((o, idx) => {
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
                        // mousedown supaya tidak kehilangan focus dulu.
                        e.preventDefault();
                        if (o.disabled) return;
                        commit(o.value);
                        closePopover();
                        triggerRef.current?.focus();
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});

export { Select };
