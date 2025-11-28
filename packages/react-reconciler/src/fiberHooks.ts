import internals from "shared/internals";
import { FiberNode } from "./fiber";
import { Dispatch, Dispatcher } from "react/src/currentDispatcher";
import { createUpdate, createUpdateQueue, enqueueUpdate, processUpdateQueue, Update, UpdateQueue } from "./updateQueue";
import { Action, ReactContext } from "shared/ReactTypes";
import { scheduleUpdateOnFiber } from "./workLoop";
import { Lane, NoLane, requestUpdateLane } from "./fiberLanes";
import { Flags, PassiveEffect } from "./fiberFlags";
import { HookHasEffect, Passive } from "./hookEffectTags";
import currentBatchConfig from "react/src/currentBatchConfig";

// 全局指针
let currentlyRenderingFiber: FiberNode | null = null;
let workInprogressHook: Hook | null = null; // 指向当前正在处理的 Hook
let currentHook: Hook | null = null
let renderLane: Lane = NoLane

const { currentDispatcher } = internals;

export interface Hook {
    memoizedState: any; // 保存 state 的值
    updateQueue: unknown; // 保存 update 队列
    next: Hook | null; // 指向下一个 Hook
    baseState: any;
    baseQueue: Update<any> | null
}

export interface Effect {
    tag: Flags
    create: EffectCallback | void
    destroy: EffectCallback | void
    deps: EffectDeps
    next: Effect | null
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
    lastEffect: Effect | null
}

type EffectCallback = () => void
type EffectDeps = any[] | null

export function renderWithHooks(wip: FiberNode, lane: Lane) {
    // 1. 赋值操作：标记当前正在渲染哪个 Fiber
    currentlyRenderingFiber = wip;
    // 2. 重置 Fiber 的 hook 链表，准备重新构建
    wip.memoizedState = null;
    wip.updateQueue = null
    renderLane = lane

    const current = wip.alternate;

    if (current !== null) {
        // update逻辑 (暂略)
        // @ts-ignore
        currentDispatcher.current = HooksDispatcherOnUpdate
    } else {
        // mount
        // @ts-ignore
        currentDispatcher.current = HooksDispatcherOnMount;
    }

    const Component = wip.type;
    const props = wip.pendingProps;
    // 执行函数组件，内部会依次调用 useState -> mountState
    const children = Component(props);

    // 重置操作
    // currentlyRenderingFiber = null;
    currentlyRenderingFiber = null
    workInprogressHook = null; // 执行完也重置
    currentHook = null
    renderLane = NoLane
    return children;
}

const HooksDispatcherOnMount: Dispatcher = {
    useState: mountState,
    useEffect: mountEffect,
    useTransition: mountTransition,
    useRef: mountRef,
    useContext: readContext,
};

const HooksDispatcherOnUpdate: Dispatcher = {
    useState: updateState,
    useEffect: updateEffect,
    useTransition: updateTransition,
    useRef: updateRef,
    useContext: readContext,
}

function readContext<T>(context: ReactContext<T>) {
        const consumer = currentlyRenderingFiber
        if(consumer ===  null) {
            throw new Error('context需要有consumer')
        }
        const value = context._currentValue
        return value
}

function updateEffect(
    create: EffectCallback | void,
    deps: EffectDeps | void
) {
    const hook = updateWorkInProgressHook()
    const nextDeps = deps === undefined ? null : deps
    let destroy: EffectCallback | void

    if (currentHook !== null) {
        const prevEffect = currentHook.memoizedState as Effect
        destroy = prevEffect.destroy

        if (nextDeps !== null) {
            // 浅比较依赖
            const prevDeps = prevEffect.deps
            if (areHookInputsEqual(nextDeps, prevDeps)) {
                hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps)
                return
            }
        }
        // 浅比较不相等
        (currentlyRenderingFiber as FiberNode).flags |= PassiveEffect
        hook.memoizedState = pushEffect(
            Passive | HookHasEffect,
            create,
            destroy,
            nextDeps
        )
    }
}

function areHookInputsEqual(
    nextDeps: EffectDeps,
    prevDeps: EffectDeps
) {
    if (prevDeps === null || nextDeps === null) {
        return false
    }
    for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
        if (Object.is(prevDeps[i], nextDeps[i])) {
            continue
        }
        return false
    }
    return true
}

function mountEffect(
    create: EffectCallback | void,
    deps: EffectDeps | void
) {
    const hook = mountWorkInProgressHook()
    const nextDeps = deps === undefined ? null : deps;
    (currentlyRenderingFiber as FiberNode).flags |= PassiveEffect

    hook.memoizedState = pushEffect(
        Passive | HookHasEffect,
        create,
        undefined,
        nextDeps
    )
}

function pushEffect(
    hooksFlag: Flags,
    create: EffectCallback | void,
    destroy: EffectCallback | void,
    deps: EffectDeps
) {
    const effect: Effect = {
        tag: hooksFlag,
        create,
        destroy,
        deps,
        next: null
    }
    const fiber = currentlyRenderingFiber as FiberNode
    const updateQueue = fiber.updateQueue as FCUpdateQueue<any>
    if (updateQueue === null) {
        const updateQueue = createFCUpdateQueue()
        fiber.updateQueue = updateQueue
        effect.next = effect
        updateQueue.lastEffect = effect
    } else {
        //  插入 effect
        const lastEffect = updateQueue.lastEffect
        if (lastEffect === null) {
            effect.next = effect
            updateQueue.lastEffect = effect
        } else {
            const firstEffect = lastEffect.next
            lastEffect.next = effect
            effect.next = firstEffect
            updateQueue.lastEffect = effect
        }
    }

    return effect
}


function createFCUpdateQueue<State>() {
    const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>
    updateQueue.lastEffect = null
    return updateQueue
}

function updateWorkInProgressHook(): Hook {
    // TODO render 阶段触发的更新
    let nextCurrentHook: Hook | null

    if (currentHook === null) {
        // FC update 时的第一个 hook
        const current = currentlyRenderingFiber?.alternate
        if (current !== null) {
            nextCurrentHook = current?.memoizedState
        } else {
            nextCurrentHook = null
        }
    } else {
        // FC update 时 后续的 hook
        if (currentHook !== null) {
            nextCurrentHook = currentHook.next
        } else {
            nextCurrentHook = null
        }
    }

    if (nextCurrentHook === null) {
        // mount/update u1 u2 u3
        // update       u1 u2 u3 u4
        throw new Error(`组件${currentlyRenderingFiber?.type}本次执行时的Hook比上次多了`)
    }

    currentHook = nextCurrentHook as Hook

    const newHook: Hook = {
        memoizedState: currentHook.memoizedState,
        updateQueue: currentHook.updateQueue,
        next: null,
        baseState: currentHook.baseState,
        baseQueue: currentHook.baseQueue,
    }

    if (workInprogressHook === null) {
        // mount 时 第一个 hook
        if (currentlyRenderingFiber === null) {
            throw new Error('请在函数组件内调用hook')
        } else {
            workInprogressHook = newHook
            currentlyRenderingFiber.memoizedState = workInprogressHook
        }
    } else {
        workInprogressHook.next = newHook
        workInprogressHook = newHook
    }

    return workInprogressHook
}

function mountState<State>(initialState: (() => State) | State): [State, Dispatch<State>] {
    // 1. 创建当前 hook 节点，并挂载到链表上
    const hook = mountWorkInProgressHook();

    // 2. 计算初始状态
    let memoizedState;
    if (initialState instanceof Function) {
        memoizedState = initialState();
    } else {
        memoizedState = initialState;
    }

    const queue = createUpdateQueue<State>();
    hook.updateQueue = queue;
    hook.memoizedState = memoizedState
    hook.baseState = memoizedState

    // 5. 创建 dispatch (setXXX)
    // 使用 bind 预先绑定 fiber 和 queue，这样用户调用时只需要传 action
    // @ts-ignore
    const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
    queue.dispatch = dispatch;

    return [memoizedState, dispatch];
}

function updateState<State>(): [State, Dispatch<State>] {
    // 1. 创建当前 hook 节点，并挂载到链表上
    const hook = updateWorkInProgressHook();

    // 2. 计算新 state 的逻辑
    const queue = hook.updateQueue as UpdateQueue<State>
    const baseState = hook.baseState

    const pending = queue.shared.pending
    const current = currentHook as Hook
    let baseQueue = hook.baseQueue

    if (pending !== null) {
        // pending baseQueue update 保存在 current 中
        if (baseQueue !== null) {
            const baseFirst = baseQueue.next
            const pendingFirst = pending.next

            baseQueue.next = pendingFirst
            pending.next = baseFirst
        }
        baseQueue = pending
        current.baseQueue = pending
        queue.shared.pending = null
    }

    if (baseQueue !== null) {
        const { memoizedState, baseState: newBaseState, baseQueue: newBaseQueue } = processUpdateQueue(
            baseState,
            baseQueue,
            renderLane
        )
        hook.memoizedState = memoizedState
        hook.baseState = newBaseState
        hook.baseQueue = newBaseQueue
    }

    return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function mountTransition(): [boolean, (callback: () => void) => void] {
    const [isPending, setPending] = mountState(false)
    const hook = mountWorkInProgressHook()
    const start = startTransition.bind(null, setPending)
    hook.memoizedState = start
    return [isPending, start]
}

function updateTransition(): [boolean, (callback: () => void) => void] {
    const [isPending] = updateState()
    const hook = updateWorkInProgressHook()
    const start = hook.memoizedState
    return [isPending as boolean, start]
}

function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
    setPending(true)
    const prevTransition = currentBatchConfig.transition
    currentBatchConfig.transition = 1

    callback()
    setPending(false)

    currentBatchConfig.transition = prevTransition
}

function mountRef<T>(initialValue: T): { current: T } {
    const hook = mountWorkInProgressHook()
    const ref = { current: initialValue }
    hook.memoizedState = ref
    return ref
}

function updateRef<T>(initialValue: T): { current: T } {
    const hook = updateWorkInProgressHook()
    return hook.memoizedState
}

function dispatchSetState<State>(
    fiber: FiberNode,
    updateQueue: UpdateQueue<State>,
    action: Action<State>
) {
    // 1. 创建 update
    const lane = requestUpdateLane()
    const update = createUpdate(action, lane);
    // 2. 入队
    enqueueUpdate(updateQueue, update);
    // 3. 开始调度更新 (从当前 fiber 找到 root，开始 render)
    scheduleUpdateOnFiber(fiber, lane);
}

function mountWorkInProgressHook(): Hook {
    const hook: Hook = {
        memoizedState: null,
        updateQueue: null,
        next: null,
        baseState: null,
        baseQueue: null,
    };

    if (workInprogressHook === null) {
        // 这是链表的第一个 hook
        if (currentlyRenderingFiber === null) {
            throw new Error('请在函数组件内使用 hook');
        } else {
            workInprogressHook = hook;
            // 将头节点挂在 Fiber 上
            currentlyRenderingFiber.memoizedState = workInprogressHook;
        }
    } else {
        // 这是后续的 hook，接在链表尾部
        workInprogressHook.next = hook;
        // 指针后移
        workInprogressHook = hook;
    }

    return hook;
}