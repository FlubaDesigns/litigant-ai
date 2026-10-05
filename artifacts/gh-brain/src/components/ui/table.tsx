import * as React from "react"

import { cn } from "@/lib/utils"
import "./table.css"

const MobileTableLabels = React.createContext<React.ReactNode[] | null>(null)

// Use the existing column headings for mobile labels; rows and actions render once.
function columnLabels(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement<{children?: React.ReactNode}>(child)) return []
    if (child.type === TableHead) return [child.props.children || "Actions"]
    if (child.type === TableHeader || child.type === TableRow) return columnLabels(child.props.children)
    return []
  })
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { mobileCards?: boolean }
>(({ className, children, mobileCards = false, ...props }, ref) => (
  <MobileTableLabels.Provider value={mobileCards ? columnLabels(children) : null}>
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      data-mobile-cards={mobileCards || undefined}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    >{children}</table>
  </div>
  </MobileTableLabels.Provider>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, children, ...props }, ref) => {
  const labels = React.useContext(MobileTableLabels)
  return (
    <tr ref={ref} className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props}>
      {React.Children.map(children, (child, index) => {
        if (!labels || !React.isValidElement<React.ComponentProps<typeof TableCell>>(child) || child.type !== TableCell || (child.props.colSpan ?? 1) > 1) return child
        return React.cloneElement(child, {}, <>
          <span className="mobile-table-label" aria-hidden="true">{labels[index]}</span>
          <div className="mobile-table-value">{child.props.children}</div>
        </>)
      })}
    </tr>
  )
})
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
