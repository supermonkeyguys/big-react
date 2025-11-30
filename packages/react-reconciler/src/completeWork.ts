import { appendInitialChild, Container, createInstance, createTextInstance, Instance } from "hostConfig";
import { FiberNode } from "./fiber";
import { NoFlags, Ref, Update, Visibility } from "./fiberFlags";
import { ContextProvider, Fragment, FunctionComponent, HostComponent, HostRoot, HostText, OffscreenComponent, SuspenseComponent } from "./workTags";
import { updateFiberProps } from "react-dom/src/SyntheticEvent";
import { popProvider } from "./fiberContext";
import { popSuspenseHandler } from "./suspenseContext";

function markUpdate(fiber: FiberNode) {
    fiber.flags |= Update
}

export const completeWork = (wip: FiberNode) => {

    const newProps = wip.pendingProps
    const current = wip.alternate

    switch (wip.tag) {
        case HostComponent:
            if (current !== null && wip.stateNode) {
                // update
                // props 是否变
                // className style
                // 变: Update flag
                // markUpdate(wip)
                updateFiberProps(wip.stateNode, newProps)
                if (current.ref !== wip.ref) {
                    markRef(wip)
                }
            } else {
                // mount
                // 构建 DOM
                const instance = createInstance(wip.type, newProps)
                // 将 DOM 插入到 DOM 树中
                appendAllChild(instance, wip)
                wip.stateNode = instance
                // 标记 Ref
                if (wip.ref !== null) {
                    markRef(wip)
                }
            }
            bubbleProperties(wip)
            return null
        case HostText:
            if (current !== null && wip.stateNode) {
                // update
                const oldText = current.memoizedProps.content
                const newText = newProps.content
                if (oldText !== newText) {
                    markUpdate(wip)
                }
            } else {
                // 构建 DOM
                const instance = createTextInstance(newProps.content)
                wip.stateNode = instance
            }
            bubbleProperties(wip)
            return null
        case HostRoot:
        case FunctionComponent:
        case Fragment:
        case OffscreenComponent:
            bubbleProperties(wip)
            return null
        case ContextProvider:
            const context = wip.type._context
            popProvider(context)
            bubbleProperties(wip)
            return null
        case SuspenseComponent:
            popSuspenseHandler();

            const offscreenFiber = wip.child as FiberNode;
            const isHidden = offscreenFiber.pendingProps.mode === 'hidden';
            const currentOffscreenFiber = offscreenFiber.alternate;
            if (currentOffscreenFiber !== null) {
                const wasHidden = currentOffscreenFiber.pendingProps.mode === 'hidden';

                if (isHidden !== wasHidden) {
                    // 可见性变化
                    offscreenFiber.flags |= Visibility;
                    bubbleProperties(offscreenFiber);
                }
            } else if (isHidden) {
                // mount时hidden
                offscreenFiber.flags |= Visibility;
                bubbleProperties(offscreenFiber);
            }
            bubbleProperties(wip);
            return null;
        default:
            return null
    }

}

function markRef(fiber: FiberNode) {
    fiber.flags |= Ref
}

function appendAllChild(parent: Container | Instance, wip: FiberNode) {
    let node = wip.child as FiberNode

    while (node !== null) {
        if (node.tag === HostComponent || node.tag === HostText) {
            appendInitialChild(parent, node?.stateNode)
        } else if (node.child !== null) {
            node.child.return = node
            node = node.child
            continue
        }

        if (node === wip) return

        while (node.sibling === null) {
            if (node.return === null || node.return === wip) {
                return
            }
            node = node?.return
        }

        node.sibling.return = node.return
        node = node.sibling
    }
}


function bubbleProperties(wip: FiberNode) {
    let subtreeFlags = NoFlags
    let child = wip.child

    while (child !== null) {
        subtreeFlags |= child.subtreeFlags
        subtreeFlags |= child.flags

        child.return = wip
        child = child.sibling
    }

    wip.subtreeFlags |= subtreeFlags
}