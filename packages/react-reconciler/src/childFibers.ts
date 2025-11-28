import { Key, Props, ReactElementType } from "shared/ReactTypes";
import { createFiberFromElement, createFiberFromFragment, createWorkInProgress, FiberNode } from "./fiber";
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from "shared/ReactSymbols";
import { Fragment, HostText } from "./workTags";
import { ChildDeletion, Placement } from "./fiberFlags";


type ExistingChildren = Map<string | number, FiberNode>

function ChildReconciler(shouldTrackEffects: boolean) {
    function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
        if (!shouldTrackEffects) {
            return
        }
        const deletions = returnFiber.deletions
        if (deletions === null) {
            returnFiber.deletions = [childToDelete]
            returnFiber.flags |= ChildDeletion
        } else {
            deletions.push(childToDelete)
        }
    }
    function deleteRemainingChildren(
        returnFiber: FiberNode,
        currentFirstChild: FiberNode | null
    ) {
        if (!shouldTrackEffects) {
            return
        }
        let childToDelete = currentFirstChild
        while (childToDelete !== null) {
            deleteChild(returnFiber, childToDelete)
            childToDelete = childToDelete.sibling
        }
    }
    function reconcilerSingleElement(returnFiber: FiberNode, currentFiber: FiberNode | null, element: ReactElementType) {
        const key = element.key
        while (currentFiber !== null) {
            // update
            if (currentFiber.key === key) {
                // key 相同
                if (element.$$typeof === REACT_ELEMENT_TYPE) {
                    if (currentFiber.type === element.type) {
                        let props = element.props
                        if (element.type === REACT_FRAGMENT_TYPE) {
                            props = element.props.children
                        }
                        // type 相同
                        const existing = useFiber(currentFiber, props)
                        existing.return = returnFiber
                        // 当前节点可复用, 标记剩下的节点删除
                        deleteRemainingChildren(returnFiber, currentFiber.sibling)
                        return existing
                    }
                    // key 相同 type 不同 删除所有旧的
                    deleteRemainingChildren(returnFiber, currentFiber)
                    break
                } else {
                    if (__DEV__) {
                        console.warn('还有未实现的React类型', element)
                        break
                    }
                }
            } else {
                // key 不同  删除旧的子节点
                deleteChild(returnFiber, currentFiber)
                currentFiber = currentFiber.sibling
            }
        }

        // 根据 element 创建 fiber
        let fiber
        if (element.type === REACT_FRAGMENT_TYPE) {
            fiber = createFiberFromFragment(element.props.children, key)
        } else {
            fiber = createFiberFromElement(element)
        }
        fiber.return = returnFiber
        return fiber
    }
    function reconcilerSingleTextNode(returnFiber: FiberNode, currentFiber: FiberNode | null, content: string | null) {
        while (currentFiber !== null) {
            // update
            if (currentFiber.tag === HostText) {
                const existing = useFiber(currentFiber, { content })
                existing.return = returnFiber
                deleteRemainingChildren(returnFiber, currentFiber.sibling)
                return existing
            }
            deleteChild(returnFiber, currentFiber)
            currentFiber = currentFiber.sibling
        }

        const fiber = new FiberNode(HostText, { content }, null)
        fiber.return = returnFiber
        return fiber
    }

    function placeSingleChild(fiber: FiberNode) {
        // 首屏 + 副作用
        if (shouldTrackEffects && fiber.alternate === null) {
            fiber.flags |= Placement
        }

        return fiber
    }

    function reconcileChildrenArray(returnFiber: FiberNode, currentFirstChild: FiberNode | null, newChild: any[]) {
        // 最后一个可复用 fiber 在 current 中的 index
        let lastPlacedIndex: number = 0
        // 创建最后一个 fiber
        let lastNewFiber: FiberNode | null = null
        // 创建的第一个 fiber
        let firstNewFiber: FiberNode | null = null

        // 1. 将 current 保存进 map
        const existingChildren: ExistingChildren = new Map()
        let current = currentFirstChild
        while (current !== null) {
            const keyToUse = current.key !== null ? current.key : current.index
            existingChildren.set(keyToUse, current)
            current = current.sibling
        }

        for (let i = 0; i < newChild.length; i++) {
            // 2. 遍历 newChild 寻找是否可复用的节点
            const after = newChild[i]
            const newFiber = updateFromMap(returnFiber, existingChildren, i, after)

            if (newFiber === null) {
                continue
            }

            // 3. 标记 插入 还是 移动
            newFiber.index = i
            newFiber.return = returnFiber

            if (lastNewFiber === null) {
                lastNewFiber = newFiber
                firstNewFiber = newFiber
            } else {
                lastNewFiber.sibling = newFiber
                lastNewFiber = lastNewFiber.sibling
            }

            if (!shouldTrackEffects) {
                continue
            }

            const current = newFiber.alternate
            if (current !== null) {
                const oldIndex = current.index
                if (oldIndex < lastPlacedIndex) {
                    // 移动
                    newFiber.flags |= Placement
                } else {
                    // 不移动
                    lastPlacedIndex = oldIndex
                }
            } else {
                // mount
                newFiber.flags |= Placement
            }
        }

        // 将 map 中剩下的标记删除
        existingChildren.forEach(fiber => {
            deleteChild(returnFiber, fiber)
        })

        return firstNewFiber
    }

    function getElementKeyToUse(element: any, index?: number): Key {
        if(
            Array.isArray(element) ||
            typeof element === 'string' || 
            typeof element === 'number' ||
            element === null ||
            element === undefined
        ) {
            return index
        }
    }

    function updateFromMap(
        returnFiber: FiberNode,
        existingChildren: ExistingChildren,
        index: number,
        element: any,
    ): FiberNode | null {
        const KeyToUse = element.key !== null ? element.key : index
        const before = existingChildren.get(KeyToUse) as FiberNode

        // HostText
        if (typeof element === 'string' || typeof element === 'number') {
            if (before) {
                if (before.tag === HostText) {
                    existingChildren.delete(KeyToUse)
                    return useFiber(before, { content: element + '' })
                }
            }
            return new FiberNode(HostText, { content: element + '' }, null)
        }

        // ReactElement 
        if (typeof element === 'object' && element !== null) {
            switch (element.$$typeof) {
                case REACT_ELEMENT_TYPE:
                    if (element.type === REACT_FRAGMENT_TYPE) {
                        return updateFragment(
                            returnFiber,
                            before,
                            element.props.children,
                            KeyToUse,
                            existingChildren
                        )
                    }
                    if (before) {
                        if (before.type === element.type) {
                            existingChildren.delete(KeyToUse)
                            return useFiber(before, element.props)
                        }
                    }
                    return createFiberFromElement(element)
            }
        }

        // TODO 数组类型 或者 Fragment
        if (Array.isArray(element)) {
            return updateFragment(
                returnFiber,
                before,
                element,
                KeyToUse,
                existingChildren,
            )
        }

        return null
    }

    return function reconcilerChildFibers(
        returnFiber: FiberNode,
        currentFiber: FiberNode | null,
        newChild?: any
    ): FiberNode | null {
        // 判断 Fragment
        const isUnKeyTopLevelFragment =
            typeof newChild === 'object' &&
            newChild !== null &&
            newChild.$$typeof === REACT_ELEMENT_TYPE &&
            newChild.type === REACT_FRAGMENT_TYPE &&   
            newChild.key === null

        if (isUnKeyTopLevelFragment) {
            newChild = newChild?.props.children
        }

        //  判断当前节点类型
        if (typeof newChild === 'object' && newChild !== null) {
            // 多节点
            if (Array.isArray(newChild)) {
                return reconcileChildrenArray(returnFiber, currentFiber, newChild)
            }

            switch (newChild.$$typeof) {
                case REACT_ELEMENT_TYPE:
                    return placeSingleChild(
                        reconcilerSingleElement(returnFiber, currentFiber, newChild)
                    )
                default:
                    if (__DEV__) console.warn('未实现的 reconciler 类型', newChild)
                    break
            }
        }

        if (typeof newChild === 'string' || typeof newChild === 'number') {
            return placeSingleChild(
                reconcilerSingleTextNode(returnFiber, currentFiber, newChild.toString())
            )
        }

        // 兜底删除
        if (currentFiber) {
            deleteRemainingChildren(returnFiber, currentFiber)
        }

        if (__DEV__) {
            console.warn('未实现的 reconciler 类型', newChild)
        }

        return null
    }
}

function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
    const clone = createWorkInProgress(fiber, pendingProps)
    clone.index = 0
    clone.sibling = null
    return clone
}

function updateFragment(
    returnFiber: FiberNode,
    current: FiberNode | null,
    elements: any[],
    key: Key,
    existingChildren: ExistingChildren
) {
    let fiber
    if (!current || current.tag !== Fragment) {
        fiber = createFiberFromFragment(elements, key)
    } else {
        existingChildren.delete(key)
        fiber = useFiber(current, elements)
    }
    fiber.return = returnFiber
    return fiber
}

export const reconcilerChildFibers = ChildReconciler(true)
export const mountChildFibers = ChildReconciler(false)