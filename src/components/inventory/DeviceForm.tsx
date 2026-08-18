'use client'

import { useForm } from 'react-hook-form'
import { DeviceStatus } from '@prisma/client'
import type { DeviceFormValues } from '@/lib/schemas/device'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

export function DeviceForm({
  form,
  onSubmit,
  formId,
}: {
  form: ReturnType<typeof useForm<DeviceFormValues>>
  onSubmit: (data: DeviceFormValues) => void
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
              <FormLabel className="text-xs font-medium text-foreground">Hostname</FormLabel>
              <FormControl>
                <Input autoFocus className={INPUT_OVERRIDE_CLS} {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="serialNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Serial Number</FormLabel>
              <FormControl>
                <Input className={`${INPUT_OVERRIDE_CLS} font-mono`} {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="assetTag"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Asset Tag</FormLabel>
              <FormControl>
                <Input
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : e.target.value)
                  }
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(DeviceStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="vendor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Vendor</FormLabel>
              <FormControl>
                <Input className={INPUT_OVERRIDE_CLS} placeholder="e.g. Cisco" {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="model"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Model</FormLabel>
              <FormControl>
                <Input className={INPUT_OVERRIDE_CLS} placeholder="e.g. Catalyst 9300" {...field} />
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
      </form>
    </Form>
  )
}
