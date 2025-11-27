// scripts/jest/jest-react.js
const scheduler = require('scheduler'); // 这里会引入我们上面 mock 的文件

module.exports = {
    act: async (callback) => {
        await callback();

        // ✅ 关键点：手动刷新 Scheduler 里的所有任务
        // 这会让 useEffect 立即执行
        if (scheduler.unstable_flushAllWithoutAsserting) {
            scheduler.unstable_flushAllWithoutAsserting();
        }
    }
};