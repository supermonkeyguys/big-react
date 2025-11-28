import { scheduleMicroTask } from "hostConfig";
import { beginWork } from "./beginWork";
import { commitHookEffectListCreate, commitHookEffectListDestroy, commitHookEffectListUnmount, commitLayoutEffects, commitMutationEffects } from "./commitWork";
import { completeWork } from "./completeWork";
import { createWorkInProgress, FiberNode, FiberRootNode, PendingPassiveEffects } from "./fiber";
import { MutationMask, NoFlags, PassiveMask } from "./fiberFlags";
import { getHighestPriorityLane, Lane, lanesToSchedulerPriority, markRootFinished, mergeLanes, NoLane, SyncLane } from "./fiberLanes";
import { flushSyncCallbacks, scheduleSyncCallback } from "./syncTaskQueue";
import { HostRoot } from "./workTags";
import {
    unstable_scheduleCallback as scheduleCallback,
    unstable_NormalPriority as NormalPriority,
    unstable_shouldYield,
    unstable_cancelCallback
} from "scheduler";
import { HookHasEffect, Passive } from "./hookEffectTags";

let workInProgress: FiberNode | null = null
let wipRootRenderLane: Lane = NoLane
let rootDoesHasPassiveEffects: Boolean = false

type RootExitStatus = number
const RootInComplete: RootExitStatus = 1
const RootCompleted: RootExitStatus = 2
// TODO 执行过程报错

function prepareFreshStack(root: FiberRootNode, lane: Lane) {
    root.finishedLane = NoLane
    root.finishedWork = null
    workInProgress = createWorkInProgress(root.current, {})
    wipRootRenderLane = lane
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
    // 调度功能
    // fiberRootNode
    const root = markUpdateFromFiberToRoot(fiber)
    markRootUpdated(root, lane)
    ensureRootIsScheduler(root)
}

function ensureRootIsScheduler(root: FiberRootNode) {
    const updateLane = getHighestPriorityLane(root.pendingLanes)
    const existingCallback = root.callbackNode

    if (updateLane === NoLane) {
        if (existingCallback !== null) {
            unstable_cancelCallback(existingCallback)
        }
        root.callbackNode = null
        root.callbackPriority = NoLane
        return
    }

    const curPriority = updateLane
    const prevPriority = root.callbackPriority

    if (curPriority === prevPriority) {
        return
    }

    if (existingCallback !== null) {
        unstable_cancelCallback(existingCallback)
    }
    let newCallbackNode = null

    if (__DEV__) {
        console.log(
            `在${updateLane === SyncLane ? '微' : '宏'}任务中调度，优先级：`,
            updateLane
        );
    }


    if (updateLane === SyncLane) {
        // 同步优先级 用微任务调度
        scheduleSyncCallback(performSyncWorkRoot.bind(null, root))
        scheduleMicroTask(flushSyncCallbacks)
    } else {
        // 其他优先级 用宏任务调度
        const schedulerPriority = lanesToSchedulerPriority(updateLane)
        // @ts-ignore
        newCallbackNode = scheduleCallback(
            schedulerPriority,
            performConcurrentWorkOnRoot.bind(null, root)
        )
    }
    root.callbackNode = newCallbackNode
    root.callbackPriority = curPriority
}

function markRootUpdated(root: FiberRootNode, lane: Lane) {
    root.pendingLanes = mergeLanes(root.pendingLanes, lane)
}

function markUpdateFromFiberToRoot(fiber: FiberNode) {
    let node = fiber
    let parent = node.return
    while (parent !== null) {
        node = parent
        parent = node.return
    }
    if (node.tag === HostRoot) {
        return node.stateNode
    }
    return null
}

function performConcurrentWorkOnRoot(root: FiberRootNode, didTimeout?: boolean): any {
    // useEffect 回调都执行完了
    const curCallback = root.callbackNode
    const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects)
    if (didFlushPassiveEffect) {
        if (root.callbackNode !== curCallback) {
            return null
        }
    }

    const lane = getHighestPriorityLane(root.pendingLanes)
    const curCallbackNode = root.callbackNode
    if (lane === NoLane) {
        return null
    }

    const needSync = lane === SyncLane || didTimeout
    // render 阶段
    const exitStatus = renderRoot(root, lane, !needSync)

    ensureRootIsScheduler(root)

    if (exitStatus === RootInComplete) {
        // 中断
        if (root.callbackNode !== curCallbackNode) {
            return null
        }
        return performConcurrentWorkOnRoot.bind(null, root)
    }
    if (exitStatus === RootCompleted) {
        const finishedWork = root.current.alternate
        root.finishedWork = finishedWork
        root.finishedLane = lane
        wipRootRenderLane = NoLane
        commitRoot(root)
    } else if (__DEV__) {
        console.error('还未实现的并发更新结束状态')
    }
}


function performSyncWorkRoot(root: FiberRootNode) {
    const nextLane = getHighestPriorityLane(root.pendingLanes)

    if (nextLane !== SyncLane) {
        // 其他比SyncLane低的优先级
        // NoLane
        ensureRootIsScheduler(root)
        return
    }

    const exitStatus = renderRoot(root, nextLane, false)

    if (exitStatus === RootCompleted) {
        const finishedWork = root.current.alternate
        root.finishedWork = finishedWork
        root.finishedLane = nextLane
        wipRootRenderLane = NoLane

        // wip fiberNode树 树中的 flags
        commitRoot(root)
    } else if (__DEV__) {
        console.error('还未实现的同步更新结束状态')
    }


}

function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
    if (__DEV__) {
        console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`)
    }

    if (wipRootRenderLane !== lane) {
        // 初始化
        prepareFreshStack(root, lane)
    }

    do {
        try {
            shouldTimeSlice ? workLoopConcurrent() : workLoopSync()
            break
        } catch (e) {
            if (__DEV__) {
                console.log('workLoopSync发生错误', e)
            }
            workInProgress = null
            throw e
        }
    } while (true)

    // 中断执行 || render阶段执行完
    if (shouldTimeSlice && workInProgress !== null) {
        return RootInComplete
    }

    // render阶段执行完
    if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
        console.error(`render阶段完成后 wip 不应该为 null`, workInProgress)
    }

    // TODO 报错情况

    return RootCompleted
}

function commitRoot(root: FiberRootNode) {
    const finishedWork = root.finishedWork

    if (finishedWork === null) {
        return
    }

    if (__DEV__) {
        console.warn('commit阶段开始', finishedWork)
    }

    const lane = root.finishedLane

    if (lane === NoLane && __DEV__) {
        console.error('commit阶段finishedLane不应该是NoLane')
    }

    // 重置
    root.finishedWork = null
    root.finishedLane = NoLane

    markRootFinished(root, lane)

    if (
        (finishedWork.flags & PassiveMask) !== NoFlags ||
        (finishedWork.subtreeFlags & PassiveMask) !== NoFlags
    ) {
        if (!rootDoesHasPassiveEffects) {
            rootDoesHasPassiveEffects = true
            // 调度副作用
            scheduleCallback(NormalPriority, () => {
                // 执行副作用
                flushPassiveEffects(root.pendingPassiveEffects)
                return
            })
        }
    }

    //  判断三个子阶段需要执行的操作
    // root.subtreeFlags && root.flags
    const subtreeHasEffect =
        (finishedWork.subtreeFlags & MutationMask) !== NoFlags
    const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags

    if (subtreeHasEffect || rootHasEffect) {
        // beforeMutation
        // mutation Placement   
        commitMutationEffects(finishedWork, root)

        root.current = finishedWork

        // layout
        commitLayoutEffects(finishedWork,root)
    } else {
        root.current = finishedWork
    }

    rootDoesHasPassiveEffects = false
    ensureRootIsScheduler(root)
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
    // 组件卸载
    let didFlushPassiveEffect = false
    pendingPassiveEffects.unmount.forEach((effect) => {
        didFlushPassiveEffect = true
        commitHookEffectListUnmount(Passive, effect)
    })
    pendingPassiveEffects.unmount = []
    // 清除副作用 return () => {}
    pendingPassiveEffects.update.forEach(effect => {
        didFlushPassiveEffect = true
        commitHookEffectListDestroy(Passive | HookHasEffect, effect)
    })
    // 执行副作用
    pendingPassiveEffects.update.forEach(effect => {
        didFlushPassiveEffect = true
        commitHookEffectListCreate(Passive | HookHasEffect, effect)
    })
    pendingPassiveEffects.update = []

    flushSyncCallbacks()
    return didFlushPassiveEffect
}

function workLoopSync() {
    while (workInProgress !== null) {
        performanceOfWork(workInProgress)
    }
}
function workLoopConcurrent() {
    while (workInProgress !== null && !unstable_shouldYield()) {
        performanceOfWork(workInProgress)
    }
}

function performanceOfWork(fiber: FiberNode) {
    const next = beginWork(fiber, wipRootRenderLane)
    fiber.memoizedProps = fiber.pendingProps

    if (next === null) {
        completeUnitOfWork(fiber)
    } else {
        workInProgress = next
    }
}

function completeUnitOfWork(fiber: FiberNode) {
    let node: FiberNode | null = fiber

    do {
        completeWork(node)
        const sibling = node.sibling

        if (sibling !== null) {
            workInProgress = sibling
            return
        }
        node = node.return
        workInProgress = node

    } while (node !== null)
}