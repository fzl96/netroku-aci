export type StackNameOption = { name: string }

export function resolveStackSelectValue(
  currentStackName: string | null | undefined,
  existingStacks: StackNameOption[],
): string {
  if (currentStackName === null || currentStackName === undefined) return '__none__'
  if (existingStacks.some((stack) => stack.name === currentStackName)) return currentStackName
  return '__new__'
}
