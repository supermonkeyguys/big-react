import generatePackageJson from "rollup-plugin-generate-package-json"
import { getBaseRollupPlugins, getPackJSON, resolvePkgPath } from "./utils"

const { name, module } = getPackJSON('react')
const pkgPath = resolvePkgPath(name)
const pkgDistPath = resolvePkgPath(name, true)

export default [
    // react
    {
        input: `${pkgPath}/${module}`,
        output: [
            {
                file: `${pkgDistPath}/index.js`,
                name: 'react',
                format: 'umd'
            }
        ],
        plugins: [...getBaseRollupPlugins(), generatePackageJson({
            inputFolder: pkgPath,
            outputFolder: pkgDistPath,
            baseContents: ({ name, description, version }) => ({
                name,
                description,
                version,
                main: 'index.js'
            })
        })]
    },
    // jsx-runtime
    {
        input: `${pkgPath}/src/jsx.ts`,
        output: [
            // jsx-runtime
            {
                file: `${pkgDistPath}/jsx-runtime.js`,
                name: 'jsx-runtime',
                format: 'umd'
            },
            // jsx-dev-runtime
            {
                file: `${pkgDistPath}/jsx-dev-runtime.js`,
                name: 'jsx-dev-runtime',
                format: 'umd'
            }
        ],
        plugins: getBaseRollupPlugins()
    }
]