'use client'

import { useForm } from 'react-hook-form'
import type { SiteFormValues } from '@/lib/schemas/site'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

export function SiteForm({
  form,
  onSubmit,
  formId,
}: {
  form: ReturnType<typeof useForm<SiteFormValues>>
  onSubmit: (data: SiteFormValues) => void
  formId: string
}) {
  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Name</FormLabel>
              <FormControl>
                <Input autoFocus className={INPUT_OVERRIDE_CLS} {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Address</FormLabel>
              <FormControl>
                <Input className={INPUT_OVERRIDE_CLS} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="latitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Latitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="longitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Longitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
