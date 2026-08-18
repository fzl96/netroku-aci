'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { DeviceStatus, StackRole } from '@prisma/client'
import type { DeviceFormValues } from '@/lib/schemas/device'
import type { SafeDeviceStack } from '@/actions/inventory/devices'
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

export function DeviceForm({
  form,
  onSubmit,
  formId,
  existingStacks = [],
}: {
  form: ReturnType<typeof useForm<DeviceFormValues>>
  onSubmit: (data: DeviceFormValues) => void
  formId: string
  existingStacks?: SafeDeviceStack[]
}) {
  const currentStackName = form.watch('deviceStackName')

  const isExisting = existingStacks.some((s) => s.name === currentStackName)
  const isNew = Boolean(currentStackName) && !isExisting

  const [stackSelectValue, setStackSelectValue] = React.useState<string>(() => {
    if (isExisting) return currentStackName!
    if (isNew) return '__new__'
    return '__none__'
  })

  React.useEffect(() => {
    if (!currentStackName) {
      setStackSelectValue('__none__')
    } else if (existingStacks.some((s) => s.name === currentStackName)) {
      setStackSelectValue(currentStackName)
    } else {
      setStackSelectValue('__new__')
    }
  }, [currentStackName, existingStacks])

  const selectedStack = existingStacks.find(
    (s) => s.name === (stackSelectValue === '__new__' ? currentStackName : stackSelectValue),
  )

  function handleStackDropdownChange(val: string) {
    setStackSelectValue(val)
    if (val === '__none__') {
      form.setValue('deviceStackName', null)
      form.setValue('stackRole', null)
      form.setValue('stackMember', null)
    } else if (val === '__new__') {
      form.setValue('deviceStackName', '')
      if (!form.getValues('stackRole')) form.setValue('stackRole', StackRole.MASTER)
      if (!form.getValues('stackMember')) form.setValue('stackMember', 1)
    } else {
      form.setValue('deviceStackName', val)
      const stack = existingStacks.find((s) => s.name === val)
      if (stack) {
        const hasMaster = stack.members?.some((m) => m.stackRole === 'MASTER')
        if (!form.getValues('stackRole')) {
          form.setValue('stackRole', hasMaster ? StackRole.MEMBER : StackRole.MASTER)
        }
        if (!form.getValues('stackMember')) {
          const usedNumbers =
            stack.members?.map((m) => m.stackMember).filter((n): n is number => n !== null) ?? []
          let nextAvailable = 1
          while (usedNumbers.includes(nextAvailable)) nextAvailable++
          form.setValue('stackMember', nextAvailable)
        }
      }
    }
  }

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

        <div className="pt-3 border-t border-border space-y-3">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-foreground">Stack Membership</div>
            <p className="text-[11px] text-muted-foreground">
              Group this device logically with other switches in a virtual chassis or switch stack.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Stack Assignment</label>
            <Select value={stackSelectValue} onValueChange={handleStackDropdownChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select stack configuration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (Standalone device)</SelectItem>
                {existingStacks.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Existing Stacks
                    </SelectLabel>
                    {existingStacks.map((s) => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name} ({s.memberCount ?? s.members?.length ?? 0} {s.memberCount === 1 ? 'member' : 'members'})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectSeparator />
                <SelectItem value="__new__" className="text-primary font-medium">
                  + Create new stack...
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {stackSelectValue === '__new__' && (
            <FormField
              control={form.control}
              name="deviceStackName"
              render={({ field }) => (
                <FormItem className="animate-fade-up">
                  <FormLabel className="text-xs font-medium text-foreground">New Stack Name</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      className={INPUT_OVERRIDE_CLS}
                      placeholder="e.g. ACC-STACK-FL02"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          )}

          {stackSelectValue !== '__none__' && selectedStack && (
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 space-y-1.5 text-xs animate-fade-up">
              <div className="font-medium text-foreground flex items-center justify-between text-[11px]">
                <span>Switches in <span className="font-mono">{selectedStack.name}</span>:</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {selectedStack.members?.length ?? 0} total
                </span>
              </div>
              {selectedStack.members && selectedStack.members.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {selectedStack.members.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono"
                    >
                      <span className="font-semibold text-foreground">Switch #{m.stackMember ?? '?'}</span>
                      <span className="text-muted-foreground truncate max-w-[100px]">{m.name}</span>
                      <span className={`text-[9px] ${m.stackRole === 'MASTER' ? 'text-primary font-medium' : 'text-subtle'}`}>
                        ({m.stackRole === 'MASTER' ? 'Master' : 'Member'})
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-subtle">No other switches currently in this stack.</p>
              )}
            </div>
          )}

          {stackSelectValue !== '__none__' && (
            <div className="grid grid-cols-2 gap-3 pt-1 animate-fade-up">
              <FormField
                control={form.control}
                name="stackRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-foreground">Stack Role</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? undefined}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={StackRole.MASTER}>Master (Active)</SelectItem>
                        <SelectItem value={StackRole.MEMBER}>Member (Standby)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stackMember"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-foreground">Switch # (Position)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={32}
                        className={INPUT_OVERRIDE_CLS}
                        placeholder="e.g. 1"
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
            </div>
          )}
        </div>
      </form>
    </Form>
  )
}
