import { appendInitialChild, Container, createInstance, createTextInstance } from "hostConfig";
import { FiberNode } from "./fiber";
import { NoFlags, Update } from "./fiberFlags";
import { Fragment, FunctionComponent, HostComponent, HostRoot, HostText } from "./workTags";
import { updateFiberProps } from "react-dom/src/SyntheticEvent";


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
                updateFiberProps(wip.stateNode, newProps)
            } else {
                // mount
                // 构建 DOM
                const instance = createInstance(wip.type, newProps)
                // 将 DOM 插入到 DOM 树中
                appendAllChild(instance, wip)
                wip.stateNode = instance
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
        case Fragment:
        case FunctionComponent:
            bubbleProperties(wip)
            return null
        default:
            return null
    }

}

function appendAllChild(parent: Container, wip: FiberNode) {
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