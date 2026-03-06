import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";

export function MultiSelect({ options = [], selected = [], onChange, label = "Filtro", className }) {
  const [open, setOpen] = useState(false);

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  const removeOne = (e, val) => {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== val));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 h-8 px-2.5 rounded-md border border-input bg-background text-xs hover:bg-accent hover:text-accent-foreground transition-colors min-w-[100px] max-w-[220px]",
            selected.length > 0 && "border-blue-300 bg-blue-50/50",
            className
          )}
          data-testid={`multiselect-${label.toLowerCase().replace(/\s/g, "-")}`}
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground truncate">{label}: Todos</span>
          ) : selected.length <= 2 ? (
            <span className="truncate flex items-center gap-1 flex-1 min-w-0">
              {selected.map((v) => (
                <Badge key={v} variant="secondary" className="text-[10px] px-1 py-0 h-5 gap-0.5 max-w-[70px] truncate">
                  <span className="truncate">{v}</span>
                  <X className="h-2.5 w-2.5 shrink-0 cursor-pointer" onClick={(e) => removeOne(e, v)} />
                </Badge>
              ))}
            </span>
          ) : (
            <span className="truncate flex items-center gap-1 flex-1">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                {selected.length} sel.
              </Badge>
            </span>
          )}
          {selected.length > 0 ? (
            <X className="h-3 w-3 shrink-0 text-slate-400 hover:text-slate-600 cursor-pointer" onClick={clear} />
          ) : (
            <ChevronsUpDown className="h-3 w-3 shrink-0 text-slate-400" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${label.toLowerCase()}...`} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-3 text-center">Sin resultados</CommandEmpty>
            <CommandGroup className="max-h-[220px] overflow-auto">
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => toggle(opt)}
                  className="text-xs cursor-pointer"
                >
                  <div className={cn(
                    "mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-primary",
                    selected.includes(opt) ? "bg-primary text-primary-foreground" : "opacity-50"
                  )}>
                    {selected.includes(opt) && <Check className="h-3 w-3" />}
                  </div>
                  <span className="truncate">{opt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
