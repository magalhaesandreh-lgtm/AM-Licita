"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "./scroll-area"
import { Input } from "./input"

interface ComboboxProps {
  options: { label: string; value: string }[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    return options.filter((option) =>
      option.label.toLowerCase().includes(search.toLowerCase())
    )
  }, [options, search])

  const selectedLabel = options.find((option) => option.value === value)?.label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{value ? selectedLabel : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
            <Input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9"
                autoFocus
            />
        </div>
        <ScrollArea className="max-h-60">
            <div className="p-1">
            {filteredOptions.length === 0 ? (
                <div className="py-2 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
                <>
                <Button
                    variant="ghost"
                    className="w-full justify-start font-normal text-muted-foreground"
                    onClick={() => {
                        onChange(null)
                        setOpen(false)
                        setSearch('')
                    }}
                >
                    Nenhum (Digitar manualmente)
                </Button>
                {filteredOptions.map((option) => (
                <Button
                    key={option.value}
                    variant="ghost"
                    className="w-full justify-start font-normal h-auto py-2 text-left"
                    onClick={() => {
                        onChange(option.value === value ? null : option.value)
                        setOpen(false)
                        setSearch('')
                    }}
                >
                    <Check
                    className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                    )}
                    />
                    {option.label}
                </Button>
                ))}
                </>
            )}
            </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
