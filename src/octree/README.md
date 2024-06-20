# Octrees

## Bit Layout

4 bytes per node

- 16 bits: Relative pointer to the first child node from current node's point in memory
- 8 bits: bit mask for the children that are present
- 8 bits: bit mask indicating if children are leaves or not