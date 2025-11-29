export type WorkTag =
    typeof FunctionComponent |
    typeof HostComponent |
    typeof HostRoot |
    typeof HostText |
    typeof Fragment |
    typeof ContextProvider | 
    typeof SuspenseComponent | 
    typeof OffscreenComponent 

export const FunctionComponent = 0
export const HostRoot = 3
export const HostComponent = 5
export const HostText = 6
export const Fragment = 7
export const ContextProvider = 11

export const SuspenseComponent = 13;
export const OffscreenComponent = 14;

export const LazyComponent = 16;
export const MemoComponent = 15;