import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const fieldVariants = cva("flex", {
  variants: {
    orientation: {
      vertical: "flex-col gap-1.5",
      horizontal: "flex-row items-center gap-4",
      responsive: "flex-col gap-1.5 @md/field-group:flex-row @md/field-group:items-center @md/field-group:gap-4",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
})

interface FieldProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof fieldVariants> {}

function Field({ className, orientation, ...props }: FieldProps) {
  return (
    <div
      data-slot="field"
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      data-slot="field-label"
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-[0.8rem] text-muted-foreground", className)}
      {...props}
    />
  )
}

function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-error"
      className={cn("text-[0.8rem] font-medium text-destructive", className)}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function FieldSet({ className, ...props }: React.HTMLAttributes<HTMLFieldSetElement>) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("space-y-2", className)}
      {...props}
    />
  )
}

function FieldLegend({ className, ...props }: React.HTMLAttributes<HTMLLegendElement>) {
  return (
    <legend
      data-slot="field-legend"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  )
}

function FieldSeparator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      data-slot="field-separator"
      className={cn("-mx-2 border-border", className)}
      {...props}
    />
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
}
