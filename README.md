# 中联塔机智能选型

基于“塔机专家”已确认样本数据的纯前端选型工具，可部署到 GitHub Pages。

## 当前型号

- 中联平臂：R90-5、R135-8、R220-10、R275-12、R335-16、R370-20。
- 中联动臂：L235-12。

不再使用旧版页面内嵌的WA、L200等数据，也不包含其他品牌。

## 项目结构

```text
public/data/
  catalog.json
  zoomlion/
    flat/<型号>/
      model.json
      performance/ordinary.json
      performance/superlift.json
      wind/C25.json
      wind/C50.json
      wind/D25.json
      wind/D50.json
    luffing/<型号>/
      model.json
      performance/ordinary.json
      wind/C25.json
src/
  selector.js      # 独立、可测试的选型算法
  data-loader.js   # 分层JSON加载
  main.js          # 页面交互
  styles.css
test/
  selector.test.js
```

选型时保持“型号＋风压＋塔身＋基础＋臂长＋倍率＋工况”为一个完整配置。普通工况优先，未指定臂长时选择最长可确认满足的臂长；非表格幅度按相邻档位规则判断，不进行线性插值。

## 本地运行

```powershell
npm ci
npm run dev
```

## 验证

```powershell
npm test
npm run build
```

## 工程边界

页面中的选型结果来自已确认的结构化样本数据，只用于快速筛选。对于受样本脚注限制但尚未完整结构化的高度，程序返回“不能确定”。正式项目仍需结合原始出厂样本和适用标准，复核风载、基础、附着、障碍物与防碰撞等工程条件。
