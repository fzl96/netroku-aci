'use client'

import { useForm } from 'react-hook-form'
import type { RackFormValues } from '@/lib/schemas/rack'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

type SiteOption = { id: string; name: string }

export function RackForm({
  form,
  onSubmit,
  formId,
  sites,
}: {
  form: ReturnType<typeof useForm<RackFormValues>>
  onSubmit: (data: RackFormValues) => void
  formId: string
  sites: SiteOption[]
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
          name="heightU"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Height (U)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="siteId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Site</FormLabel>
              <FormControl>
                <NativeSelect
                  className="w-full"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  <NativeSelectOption value="">Select a site</NativeSelectOption>
                  {sites.map((site) => (
                    <NativeSelectOption key={site.id} value={site.id}>
                      {site.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
