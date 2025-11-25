import { ReactElementType } from "shared/ReactTypes";
import { FiberNode } from "./fiber";
import { processUpdateQueue, UpdateQueue } from "./updateQueue";
import { Fragment, FunctionComponent, HostComponent, HostRoot, HostText } from "./workTags";
import { mountChildFibers, reconcilerChildFibers } from "./childFibers";
import { renderWithHooks } from "./fiberHooks";
import { Lane } from "./fiberLanes";

export const beginWork = (wip: FiberNode, renderLane: Lane) => {
    switch (wip.tag) {
        // 容器 root
        case HostRoot:
            return updateHostRoot(wip, renderLane)
        case HostComponent:
            return updateHostComponent(wip)
        case FunctionComponent:
            return updateFunctionComponent(wip, renderLane)
        case HostText:
            return null
        case Fragment:
            return updateFragment(wip)
        default:
            if (__DEV__) {
                console.warn('beginWork 未实现该类')
            }
            break
    }

    return null
}

function updateFragment(wip: FiberNode) {
    const nextChildren = wip.pendingProps
    reconcilerChildren(wip, nextChildren)
    return wip.child
}

function updateFunctionComponent(wip: FiberNode, renderLane: Lane) {
    const nextChildren = renderWithHooks(wip, renderLane)
    reconcilerChildren(wip, nextChildren)
    return wip.child
}

function updateHostRoot(wip: FiberNode, renderLane: Lane) {
    const baseState = wip.memoizedState
    const updateQueue = wip.updateQueue as UpdateQueue<Element>
    const pending = updateQueue.shared.pending
    updateQueue.shared.pending = null
    const { memoizedState } = processUpdateQueue(baseState, pending, renderLane)
    wip.memoizedState = memoizedState

    const nextChildren = wip.memoizedState
    reconcilerChildren(wip, nextChildren)
    return wip.child
}

function updateHostComponent(wip: FiberNode) {
    const nextProps = wip.pendingProps
    const nextChildren = nextProps.children
    reconcilerChildren(wip, nextChildren)
    return wip.child
}


function reconcilerChildren(wip: FiberNode, children?: ReactElementType) {
    const current = wip.alternate

    if (current !== null) {
        wip.child = reconcilerChildFibers(wip, current?.child, children)
    } else {
        wip.child = mountChildFibers(wip, null, children)
    }
}