import { appendChildToContainer, commitUpdate, Container, insertChildToContainer, Instance, removeChild } from "hostConfig";
import { FiberNode, FiberRootNode, PendingPassiveEffects } from "./fiber";
import { ChildDeletion, Flags, MutationMask, NoFlags, PassiveEffect, Placement, Update } from "./fiberFlags";
import { FunctionComponent, HostComponent, HostRoot, HostText } from "./workTags";
import { Effect, FCUpdateQueue } from "./fiberHooks";
import { HookHasEffect } from "./hookEffectTags";

let nextEffect: FiberNode | null = null

export const commitMutationEffects = (finishedWork: FiberNode, root: FiberRootNode) => {
    nextEffect = finishedWork

    while (nextEffect !== null) {
        const child: FiberNode | null = nextEffect.child

        if ((nextEffect.subtreeFlags & MutationMask) !== NoFlags && child !== null) {
            nextEffect = child

        } else {
            // 向上 DFS
            up: while (nextEffect !== null) {
                commitMutationEffectsOnFiber(nextEffect, root)

                const sibling: FiberNode | null = nextEffect.sibling

                if (sibling !== null) {
                    nextEffect = sibling
                    break up
                }

                nextEffect = nextEffect.return
            }

        }

    }
}

const commitMutationEffectsOnFiber = (finishedWork: FiberNode, root: FiberRootNode) => {
    const flags = finishedWork.flags

    if ((flags & MutationMask) !== NoFlags) {
        commitPlacement(finishedWork)
        finishedWork.flags &= ~Placement
    }

    // flags Update
    if ((flags & Update) !== NoFlags) {
        commitUpdate(finishedWork)
        finishedWork.flags &= ~Update
    }
    // flags ChildDeletion
    if ((flags & ChildDeletion) !== NoFlags) {
        const deletions = finishedWork.deletions
        if (deletions !== null) {
            deletions.forEach(childToDelete => {
                commitDeletion(childToDelete, root)
            })
        }
        finishedWork.flags &= ~ChildDeletion
    }

    if ((flags & PassiveEffect) != NoFlags) {
        // 收集回调
        commitPassiveEffect(finishedWork, root, "update")
        finishedWork.flags &= ~PassiveEffect
    }
}

function commitPassiveEffect(
    fiber: FiberNode,
    root: FiberRootNode,
    type: keyof PendingPassiveEffects
) {
    // update  unmount
    console.log("type: ", type)
    if (
        fiber.tag !== FunctionComponent ||
        (type === 'update' && (fiber.flags & PassiveEffect) === NoFlags)
    ) {
        return
    }
    const updateQueue = fiber.updateQueue as FCUpdateQueue<any>
    if (updateQueue !== null) {
        if (updateQueue.lastEffect === null && __DEV__) {
            console.error('当FC存在PassiveEffect flag时, 不应该不存在effect')
        }
        console.log(updateQueue.lastEffect)
        root.pendingPassiveEffects[type].push(updateQueue.lastEffect as Effect)
    }
}

function commitHookEffectList(
    flags: Flags,
    lastEffect: Effect,
    callback: (effect: Effect) => void
) {
    let effect = lastEffect.next as Effect

    do {
        if ((effect.tag & flags) === flags) {
            callback(effect)
        }
        effect = effect.next as Effect
    } while (effect !== lastEffect.next)

}

export function commitHookEffectListUnmount(flags: Flags, lastEffect: Effect) {
    commitHookEffectList(flags, lastEffect, effect => {
        const destroy = effect.destroy
        if (typeof destroy === 'function') {
            destroy()
        }
    })
}

export function commitHookEffectListDestroy(flags: Flags, lastEffect: Effect) {
    commitHookEffectList(flags, lastEffect, effect => {
        const destroy = effect.destroy
        if (typeof destroy === 'function') {
            destroy()
        }
        effect.tag &= ~HookHasEffect
    })
}

export function commitHookEffectListCreate(flags: Flags, lastEffect: Effect) {
    commitHookEffectList(flags, lastEffect, effect => {
        const create = effect.create
        if (typeof create === 'function') {
            effect.destroy = create()
        }
        effect.tag &= ~HookHasEffect
    })
}

function recordHostChildrenToDelete(
    childrenToDelete: FiberNode[],
    unmountFiber: FiberNode,
) {
    // 1. 找到第一个 root host 节点
    let lastOne = childrenToDelete[childrenToDelete.length - 1]

    if (!lastOne) {
        childrenToDelete.push(unmountFiber)
    } else {
        let node = lastOne.sibling
        while (node !== null) {
            if (unmountFiber === node) {
                childrenToDelete.push(unmountFiber)
            }
            node = node.sibling
        }
    }

    // 2. 每找到一个 host 节点, 判断下这个节点是不是 1 找到的那个兄弟节点
}

function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
    // 找到子树的根
    let rootChildrenToDelete: FiberNode[] = []

    // 递归子树
    commitNestedComponent(childToDelete, unmountFiber => {
        switch (unmountFiber.tag) {
            case HostComponent:
                recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber)
                // TODO 解绑 ref
                return
            case HostText:
                recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber)
            case FunctionComponent:
                // TODO useEffect unmount、解绑 ref
                commitPassiveEffect(unmountFiber, root, 'unmount')
            default:
                if (__DEV__) {
                    console.warn('未处理的unmount类型', unmountFiber)
                }
                return
        }
    })

    // 移除 rootHostComponent 的 DOM
    if (rootChildrenToDelete.length !== 0) {
        const hostParent = getHostParent(childToDelete)
        if (hostParent !== null) {
            rootChildrenToDelete.forEach(node => {
                removeChild(node.stateNode, hostParent)
            })
        }
    }
    childToDelete.return = null
    childToDelete.child = null
}

// 递归子树
function commitNestedComponent(
    root: FiberNode,
    onCommitUnmount: (fiber: FiberNode) => void
) {
    let node = root
    while (true) {
        onCommitUnmount(node)

        if (node.child !== null) {
            node.child.return = node
            node = node.child
            continue
        }
        if (node === root) {
            return
        }
        while (node.sibling === null) {
            if (node.return === null || node.return === root) {
                return
            }
            // 向上归
            node = node.return
        }
        node.sibling.return = node.return
        node = node.sibling
    }
}

const commitPlacement = (finishedWork: FiberNode) => {
    if (__DEV__) {
        console.log('执行Placement操作', finishedWork)
    }

    // parent DOM
    const hostParent = getHostParent(finishedWork)

    // host sibling
    const sibling = getHostSibling(finishedWork)

    // finishedWork ~~ DOM append parent DOM
    if (hostParent !== null) {
        insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling)
    }
}

function getHostParent(fiber: FiberNode): Container | null {
    let parent = fiber.return

    while (parent) {
        const parentTag = parent.tag
        // HostComponent HostRoot
        if (parentTag === HostComponent) {
            return parent.stateNode as Container
        }
        if (parentTag === HostRoot) {
            return (parent.stateNode as FiberRootNode).container
        }
        parent = parent.return
    }

    if (__DEV__) {
        console.warn('未找到 host parent')
    }

    return null
}

function getHostSibling(fiber: FiberNode) {
    let node: FiberNode = fiber

    findSibling: while (true) {
        while (node.sibling === null) {
            const parent = node.return

            if (parent === null || parent.tag === HostComponent || parent.tag === HostRoot) {
                return null
            }

            node = parent
        }
        node.sibling.return = node.return
        node = node.sibling

        while (node.tag !== HostText && node.tag !== HostComponent) {
            // 向下遍历 
            if ((node.flags & Placement) !== NoFlags) {
                // 移动节点 不稳定 继续向下寻找
                continue findSibling
            }
            if (node.child === null) {
                // 已寻到底
                continue findSibling
            } else {
                node.child.return = node
                node = node.child
            }
        }

        if ((node.flags & Placement) === NoFlags) {
            return node.stateNode
        }
    }
}

function insertOrAppendPlacementNodeIntoContainer(
    finishedWork: FiberNode,
    hostParent: Container,
    before?: Instance
) {
    // fiber host
    // 真 DOM , 执行插入操作
    if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
        if (before) {
            insertChildToContainer(finishedWork.stateNode, hostParent, before)
        } else {
            appendChildToContainer(hostParent, finishedWork.stateNode)
        }
        return
    }

    // 不是 DOM 元素(比如是 FunctionComponent) , 则继续向下递归寻找
    const child = finishedWork.child
    if (child !== null) {
        insertOrAppendPlacementNodeIntoContainer(child, hostParent)
        let sibling = child.sibling

        while (sibling !== null) {
            insertOrAppendPlacementNodeIntoContainer(sibling, hostParent)
            sibling = sibling.sibling
        }
    }

}