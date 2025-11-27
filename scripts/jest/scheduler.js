// scripts/jest/scheduler.js

const scheduler = jest.requireActual('scheduler');

// 1. 创建一个任务队列
const taskQueue = [];

module.exports = {
    ...scheduler,

    // 2. 覆盖 scheduleCallback：不走真实的调度，而是存进我们的数组
    unstable_scheduleCallback: (priority, callback, options) => {
        const task = {
            callback,
            priority,
            options
        };
        taskQueue.push(task);
    },

    // 3. 覆盖 cancelCallback：从数组移除
    unstable_cancelCallback: (task) => {
        const index = taskQueue.indexOf(task);
        if (index !== -1) {
            taskQueue.splice(index, 1);
        }
    },

    // 4. 实现 flushAll：执行队列里所有任务（给 act 用）
    unstable_flushAllWithoutAsserting: () => {
        // 防止执行过程中又有新任务加入，使用 while
        while (taskQueue.length > 0) {
            const task = taskQueue.shift();
            task.callback();
        }
    },

    // 5. 之前的测试辅助方法保持不变
    unstable_yieldValue: (value) => {
        // 这里需要一个全局变量存储 yields，为了简单，我们复用之前的逻辑
        // 但由于 module.exports 每次可能重新求值，最好挂在 global 上或者闭包里
        if (!global.__yields) global.__yields = [];
        global.__yields.push(value);
    },

    unstable_clearYields: () => {
        if (!global.__yields) return [];
        const values = [...global.__yields];
        global.__yields = [];
        return values;
    },
};