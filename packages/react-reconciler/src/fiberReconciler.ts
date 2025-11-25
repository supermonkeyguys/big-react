import { ReactElementType } from "shared/ReactTypes";
import { FiberNode, FiberRootNode } from "./fiber";
import { createUpdate, createUpdateQueue, enqueueUpdate, UpdateQueue } from "./updateQueue";
import { HostRoot } from "./workTags";
import { scheduleUpdateOnFiber } from "./workLoop";
import { Container } from "hostConfig";
import { requestUpdateLane } from "./fiberLanes";

export function createContainer(container: Container) {
    const hostRootFiber = new FiberNode(HostRoot, {}, null)
    const root = new FiberRootNode(container, hostRootFiber)
    hostRootFiber.updateQueue = createUpdateQueue()

    return root
}

export function updateContainer(element: ReactElementType | null, root: FiberRootNode) {
    const lane = requestUpdateLane()
    const hostRootFiber = root.current
    const update = createUpdate<ReactElementType | null>(element, lane)
    enqueueUpdate(hostRootFiber.updateQueue as UpdateQueue<ReactElementType | null>, update)

    scheduleUpdateOnFiber(hostRootFiber, lane)

    return element
} 