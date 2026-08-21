# Fix manual blocker assignment in the generated gameplay bundle.
# The production 6.13 bundle exported canBlock from card-evaluation.js but the
# game module omitted it from its destructuring import before assignBlocker().
rep(
    'const { cardTraits } = __modules["./card-evaluation.js"];\n\nfunction opponentPlayerIds',
    'const { canBlock, cardTraits } = __modules["./card-evaluation.js"];\n\nfunction opponentPlayerIds',
    'game imports canBlock for assignBlocker',
)
