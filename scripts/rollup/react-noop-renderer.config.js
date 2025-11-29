import generatePackageJson from "rollup-plugin-generate-package-json"
import { getBaseRollupPlugins, getPackJSON, resolvePkgPath } from "./utils"
import alias from '@rollup/plugin-alias';

const { name, module, peerDependencies } = getPackJSON('react-noop-renderer')
// react-dom 包的路径
const pkgPath = resolvePkgPath(name)
// react-dom 产物路径
const pkgDistPath = resolvePkgPath(name, true)

export default [
    // react-dom
    {
        input: `${pkgPath}/${module}`,
        output: [
            {
                file: `${pkgDistPath}/index.js`,
                name: 'ReactNoopRenderer',
                format: 'umd'
            }
        ],
        external: [...Object.keys(peerDependencies), 'scheduler'],
        plugins: [
            alias({
                entries: {
                    hostConfig: `${pkgPath}/src/hostConfig.ts`
                }
            }),
            ...getBaseRollupPlugins({
                typescript: {
                    exclude: ['./packages/react-dom/**/*'],
                    tsconfigOverride: {
                        compilerOptions: {
                            paths: {
                                hostConfig: [`./${name}/src/hostConfig.ts`]
                            }
                        }
                    }
                }
            }),
            generatePackageJson({
                inputFolder: pkgPath,
                outputFolder: pkgDistPath,
                baseContents: ({ name, description, version }) => ({
                    name,
                    description,
                    version,
                    peerDependencies: {
                        react: version
                    },
                    main: 'index.js'
                })
            })]
    }
]