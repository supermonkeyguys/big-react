import { Action } from "shared/ReactTypes";
import { Update } from "./fiberFlags";
import { Dispatch } from "react/src/currentDispatcher";
import { Lane } from "./fiberLanes";

export interface Update<State> {
    action: Action<State>
    lane: Lane
    next: Update<any> | null
}

export interface UpdateQueue<State> {
    shared: {
        pending: Update<State> | null
    }
    dispatch: Dispatch<State> | null
}

export const createUpdate = <State>(action: Action<State>, lane: Lane): Update<State> => {
    return {
        action,
        lane,
        next: null
    }
}

export const createUpdateQueue = <State>() => {
    return {
        shared: {
            pending: null
        },
        dispatch: null
    } as UpdateQueue<State>
}

export const enqueueUpdate = <State>(
    updateQueue: UpdateQueue<State>,
    update: Update<State>
) => {
    // 构造环状链表

    const pending = updateQueue.shared.pending
    if (pending === null) {
        // 初始构造环状链表
        update.next = update
    } else {
        // 让新节点指向队列的第一个(初始的第一个)
        update.next = pending.next
        // 让链表最后的节点指向自己(指新的节点)
        pending.next = update
    }
    // 让pending指向新的节点
    updateQueue.shared.pending = update
}

export const processUpdateQueue = <State>(
    baseState: State,
    pendingUpdate: Update<State> | null,
    renderLane: Lane
): { memoizedState: State } => {
    const result: ReturnType<typeof processUpdateQueue<State>> = { memoizedState: baseState }

    if (pendingUpdate !== null) {
        const first = pendingUpdate.next
        let pending = pendingUpdate.next as Update<any>

        do {
            const updateLane = pending.lane
            if (updateLane === renderLane) {
                const action = pending.action
                if (action instanceof Function) {
                    baseState = action(baseState)
                } else {
                    baseState = action
                }
            } else {
                if (__DEV__) console.error('不应该进入updateLane !== renderLane')
            }
            pending = pending.next as Update<any>
        } while (pending !== first)
    }

    result.memoizedState = baseState
    return result
}