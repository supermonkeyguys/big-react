import { ReactElementType } from "shared/ReactTypes";
import { FiberNode } from "./fiber";
import { processUpdateQueue, UpdateQueue } from "./updateQueue";
import { ContextProvider, Fragment, FunctionComponent, HostComponent, HostRoot, HostText } from "./workTags";
import { mountChildFibers, reconcilerChildFibers } from "./childFibers";
import { renderWithHooks } from "./fiberHooks";
import { Lane } from "./fiberLanes";
import { Ref } from "./fiberFlags";
import { pushProvider } from "./fiberContext";

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
        case ContextProvider:
            return updateContextProvider(wip)
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
    markRef(wip.alternate, wip)
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

function markRef(current: FiberNode | null, workInProgress: FiberNode) {
    const ref = workInProgress.ref

    if (
        (current === null && ref !== null) ||
        (current !== null && current.ref !== ref)
    ) {
        workInProgress.flags |= Ref
    }
}

function updateContextProvider(wip: FiberNode) {
    const providerType = wip.type
    const context = providerType._context
    const oldProps = wip.memoizedProps
    const newProps = wip.pendingProps
    const newValue = newProps.value

    if(__DEV__ && !('value' in newProps)) {
        console.warn('<Context.Provider>需要传递value props')
    }

    if(oldProps !== null) {
        if(newValue !== oldProps.value) {
                // TODO
                // context.value 变化
                // 从Provider向下DFS, 寻找消费了当前变化的 context 的 consumer
                // 如果找到 consumer, 从 consumer 向上遍历到 Provider
                // 标记沿途组件存在更新
        }
    }

    pushProvider(context,newValue)
    const nextChildren = newProps.children
    reconcilerChildren(wip, nextChildren)
    return wip.child
}