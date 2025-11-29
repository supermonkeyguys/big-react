import React from 'react'
import { useState, use, useEffect } from 'react';

const delay = (t) =>
	new Promise((r) => {
		setTimeout(r, t);
	});

const cachePool: any[] = [];

function fetchData(id, timeout) {
	const cache = cachePool[id];
	if (cache) {
		return cache;
	}
    const data = (Math.random() as any).toFixed(2) * 100
	return (cachePool[id] = delay(timeout).then(() => {
		return { data: data };
	}));
}

export function Cpn({ id, timeout }) {
	const [num, updateNum] = useState(0);
	const { data } = use(fetchData(id, timeout));

	if (num !== 0 && num % 5 === 0) {
		cachePool[id] = null;
	}

	useEffect(() => {
		console.log('effect create');
		return () => console.log('effect destroy');
	}, []);

	return (
		<ul onClick={() => updateNum(num + 1)}>
			<li>ID: {id}</li>
			<li>随机数: {data}</li>
			<li>状态: {num}</li>
		</ul>
	);
}