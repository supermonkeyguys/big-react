import { ReactElementType } from "shared/ReactTypes";
import { createFiberFromFragment, createFiberFromOffscreen, createWorkInProgress, FiberNode, OffscreenProps } from "./fiber";
import { processUpdateQueue, UpdateQueue } from "./updateQueue";
import { ContextProvider, Fragment, FunctionComponent, HostComponent, HostRoot, HostText, OffscreenComponent, SuspenseComponent } from "./workTags";
import { cloneChildFibers, mountChildFibers, reconcilerChildFibers } from "./childFibers";
import { renderWithHooks } from "./fiberHooks";
import { includeSomeLanes, Lane, NoLanes } from "./fiberLanes";
import { ChildDeletion, DidCapture, NoFlags, Placement, Ref, Visibility } from "./fiberFlags";
import { pushProvider } from "./fiberContext";
import { pushSuspenseHandler } from "./suspenseContext";

// bailout
let didReceiveUpdate = false

export function markWipReceivedUpdate() {
    didReceiveUpdate = true;
}


export const beginWork = (wip: FiberNode, renderLane: Lane) => {
    // 在 beginWork 函数开头
    console.log('beginWork:', wip.type, 'lanes:', wip.lanes, 'childLanes:', wip.childrenLanes);
    // bailout策略
    didReceiveUpdate = false;
    const current = wip.alternate;

    if (current !== null) {
        const oldProps = current.memoizedProps;
        const newProps = wip.pendingProps;

        if (oldProps !== newProps || current.type !== wip.type) {
            didReceiveUpdate = true;
        } else {
            // state context
            const hasScheduledStateOrContext = checkScheduledUpdateOrContext(
                current,
                renderLane
            );

            if (!hasScheduledStateOrContext && (wip.flags & DidCapture) === NoFlags) {
                // 四要素～ state context
                // 命中bailout
                didReceiveUpdate = false;

                switch (wip.tag) {
                    case ContextProvider:
                        const newValue = wip.memoizedProps.value;
                        const context = wip.type._context;
                        pushProvider(context, newValue);
                        break;
                    // TODO Suspense
                }

                return bailoutOnAlreadyFinishedWork(wip, renderLane);
            }
        }
    }

    wip.lanes = NoLanes;

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
        case SuspenseComponent:
            return updateSuspenseComponent(wip)
        case OffscreenComponent:
            return updateOffscreenComponent(wip)
        default:
            if (__DEV__) {
                console.warn('beginWork 未实现该类')
            }
            break
    }

    return null
}

function bailoutOnAlreadyFinishedWork(wip: FiberNode, renderLane: Lane) {
    if (!includeSomeLanes(wip.childrenLanes, renderLane)) {
        if (__DEV__) {
            console.warn('bailout整棵子树', wip);
        }
        return null;
    }

    if (__DEV__) {
        console.warn('bailout一个fiber', wip);
    }
    cloneChildFibers(wip);
    return wip.child;
}

function checkScheduledUpdateOrContext(
    current: FiberNode,
    renderLane: Lane
): boolean {
    const updateLanes = current.lanes;

    if (includeSomeLanes(updateLanes, renderLane)) {
        return true;
    }
    return false;
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

    if (__DEV__ && !('value' in newProps)) {
        console.warn('<Context.Provider>需要传递value props')
    }

    if (oldProps !== null) {
        if (newValue !== oldProps.value) {
            // TODO
            // context.value 变化
            // 从Provider向下DFS, 寻找消费了当前变化的 context 的 consumer
            // 如果找到 consumer, 从 consumer 向上遍历到 Provider
            // 标记沿途组件存在更新
        }
    }

    pushProvider(context, newValue)
    const nextChildren = newProps.children
    reconcilerChildren(wip, nextChildren)
    return wip.child
}

function updateOffscreenComponent(workInProgress: FiberNode) {
    const nextProps = workInProgress.pendingProps;
    const nextChildren = nextProps.children;
    const current = workInProgress.alternate;

    if (current !== null) {
        const prevProps = current.memoizedProps || current.pendingProps
        if (nextProps.mode !== prevProps.mode) {
            workInProgress.flags |= Visibility;
        }
    }

    reconcilerChildren(workInProgress, nextChildren);
    return workInProgress.child;
}

function updateSuspenseComponent(workInProgress: FiberNode) {
    const current = workInProgress.alternate;
    const nextProps = workInProgress.pendingProps;

    let showFallback = false;
    const didSuspend = (workInProgress.flags & DidCapture) !== NoFlags;

    if (didSuspend) {
        showFallback = true;
        workInProgress.flags &= ~DidCapture;
    }
    const nextPrimaryChildren = nextProps.children;
    const nextFallbackChildren = nextProps.fallback;
    pushSuspenseHandler(workInProgress);

    if (current === null) {
        if (showFallback) {
            return mountSuspenseFallbackChildren(
                workInProgress,
                nextPrimaryChildren,
                nextFallbackChildren
            );
        } else {
            return mountSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
        }
    } else {
        if (showFallback) {
            return updateSuspenseFallbackChildren(
                workInProgress,
                nextPrimaryChildren,
                nextFallbackChildren
            );
        } else {
            return updateSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
        }
    }
}

function mountSuspensePrimaryChildren(
    workInProgress: FiberNode,
    primaryChildren: any
) {
    const primaryChildProps: OffscreenProps = {
        mode: 'visible',
        children: primaryChildren
    };
    const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
    workInProgress.child = primaryChildFragment;
    primaryChildFragment.return = workInProgress;
    return primaryChildFragment;
}

function mountSuspenseFallbackChildren(
    workInProgress: FiberNode,
    primaryChildren: any,
    fallbackChildren: any
) {
    const primaryChildProps: OffscreenProps = {
        mode: 'hidden',
        children: primaryChildren
    };
    const primaryChildFragment = createFiberFromOffscreen(primaryChildProps);
    const fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
    // 父组件Suspense已经mount，所以需要fallback标记Placement
    fallbackChildFragment.flags |= Placement;

    primaryChildFragment.return = workInProgress;
    primaryChildFragment.sibling = fallbackChildFragment;
    fallbackChildFragment.return = workInProgress;
    workInProgress.child = primaryChildFragment;

    return fallbackChildFragment;
}

function updateSuspensePrimaryChildren(
    workInProgress: FiberNode,
    primaryChildren: any
) {
    const current = workInProgress.alternate as FiberNode;
    const currentPrimaryChildFragment = current.child as FiberNode;
    const currentFallbackChildFragment: FiberNode | null =
        currentPrimaryChildFragment.sibling;

    const primaryChildProps: OffscreenProps = {
        mode: 'visible',
        children: primaryChildren
    };

    const primaryChildFragment = createWorkInProgress(
        currentPrimaryChildFragment,
        primaryChildProps
    );
    primaryChildFragment.return = workInProgress;
    primaryChildFragment.sibling = null;
    workInProgress.child = primaryChildFragment;

    if (currentFallbackChildFragment !== null) {
        const deletions = workInProgress.deletions;
        if (deletions === null) {
            workInProgress.deletions = [currentFallbackChildFragment];
            workInProgress.flags |= ChildDeletion;
        } else {
            deletions.push(currentFallbackChildFragment);
        }
    }

    return primaryChildFragment;
}

function updateSuspenseFallbackChildren(
    workInProgress: FiberNode,
    primaryChildren: any,
    fallbackChildren: any
) {
    const current = workInProgress.alternate as FiberNode;
    const currentPrimaryChildFragment = current.child as FiberNode;
    const currentFallbackChildFragment: FiberNode | null =
        currentPrimaryChildFragment.sibling;

    const primaryChildProps: OffscreenProps = {
        mode: 'hidden',
        children: primaryChildren
    };

    const primaryChildFragment = createWorkInProgress(
        currentPrimaryChildFragment,
        primaryChildProps
    );
    let fallbackChildFragment;

    if (currentFallbackChildFragment !== null) {
        // 可以复用
        fallbackChildFragment = createWorkInProgress(
            currentFallbackChildFragment,
            fallbackChildren
        );
    } else {
        fallbackChildFragment = createFiberFromFragment(fallbackChildren, null);
        fallbackChildFragment.flags |= Placement;
    }
    fallbackChildFragment.return = workInProgress;
    // primaryChildFragment.return = workInProgress;
    // primaryChildFragment.sibling = fallbackChildFragment;
    workInProgress.child = fallbackChildFragment
    // workInProgress.child = primaryChildFragment;

    return fallbackChildFragment;
}