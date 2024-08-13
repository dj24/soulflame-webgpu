# Octrees

## Bit Layout

2 bytes per node

### Non-Leaf
- 16 bits: Relative pointer to the first child node from current node's point in memory
- 8 bits: bit mask for the children that are present

### Leaf
- 8 bits: 0 value (pointer of 0 is not valid, so we can use to determine leaf nodes)
- 8 bits: palette value
