export type Flags = number 

export const NoFlags = 0b000000000000
export const Placement = 0b000000000010
export const Update = 0b000000000100
export const ChildDeletion = 0b000000010000
export const PassiveEffect = 0b000000100000
export const Ref = 0b000001000000

export const MutationMask = Placement | Update | ChildDeletion
export const LayoutMask = Ref
export const PassiveMask = PassiveEffect | ChildDeletion