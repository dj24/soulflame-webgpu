struct SVGFConfig {
          normalSigma: f32,
          depthSigma: f32,
          blueNoiseScale: f32,
          spatialSigma: f32,
        }

        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var normalTex : texture_2d<f32>;
        @group(0) @binding(2) var worldPosTex : texture_2d<f32>;
        @group(0) @binding(3) var outputTex : texture_storage_2d<rgba16float, write>;
        @group(0) @binding(4) var<uniform> atrousRate : u32;
        @group(0) @binding(5) var linearSampler : sampler;
        @group(0) @binding(6) var nearestSampler : sampler;

        @group(1) @binding(0) var<uniform> svgfConfig : SVGFConfig;

        const OFFSETS = array<vec2<i32>, 9>(
            vec2<i32>(-1, -1), vec2<i32>(0, -1), vec2<i32>(1, -1),
            vec2<i32>(-1, 0), vec2<i32>(0, 0), vec2<i32>(1, 0),
            vec2<i32>(-1, 1), vec2<i32>(0, 1), vec2<i32>(1, 1)
        );

        const WEIGHTS = array<f32, 9>(
            0.0625, 0.125, 0.0625,
            0.125, 0.25, 0.125,
            0.0625, 0.125, 0.0625
        );

        @compute @workgroup_size(8,8,1)
        fn main(
         @builtin(global_invocation_id) id : vec3<u32>
        ){
            var passInfluence = 1.0 / f32(atrousRate);
            var colour = vec3(0.0);
            var weightSum = 0.00001;
            var resolution = vec2<f32>(textureDimensions(inputTex));
            let uv = (vec2<f32>(id.xy) + vec2(0.5)) / resolution;
            var colourRef = textureLoad(inputTex, id.xy, 0).rgb;
            let normalRef = textureSampleLevel(normalTex, nearestSampler, uv, 0).rgb;
            let worldPosRef = textureSampleLevel(worldPosTex, nearestSampler, uv, 0);

            let depthRef = worldPosRef.w;
            for(var i = 0; i < 9; i = i + 1){
                let uvOffset = (vec2<f32>(OFFSETS[i]) / resolution) * f32(atrousRate);
                let colourSample = textureSampleLevel(inputTex, linearSampler, uv + uvOffset, 0);
                if(length(colourSample.rgb) < 0.0001){
                    continue;
                }

                let normal = textureSampleLevel(normalTex, nearestSampler, uv + uvOffset, 0).rgb;
                let normalWeight = exp(-dot(normalRef - normal, normalRef - normal) / (2.0 * svgfConfig.normalSigma * svgfConfig.normalSigma));

                let worldPos = textureSampleLevel(worldPosTex, nearestSampler, uv + uvOffset, 0);
                let depth = worldPos.w;

                let depthWeight = exp(-pow(depthRef - depth, 2.0) / (2.0 * svgfConfig.depthSigma * svgfConfig.depthSigma));

                let weight = normalWeight * depthWeight * WEIGHTS[i];
                colour += colourSample.rgb * weight;
                weightSum += weight;
            }
            colour /= weightSum;
            textureStore(outputTex, id.xy, vec4<f32>(colour, 1.0));
        }