/*! For license information please see 989.main.js.LICENSE.txt */
(()=>{"use strict";var e={590:(e,t,n)=>{n.d(t,{p:()=>u});const r=Symbol("Comlink.proxy"),o=Symbol("Comlink.endpoint"),a=Symbol("Comlink.releaseProxy"),s=Symbol("Comlink.finalizer"),i=Symbol("Comlink.thrown"),c=e=>"object"==typeof e&&null!==e||"function"==typeof e,l=new Map([["proxy",{canHandle:e=>c(e)&&e[r],serialize(e){const{port1:t,port2:n}=new MessageChannel;return u(e,t),[n,[n]]},deserialize:e=>(e.start(),d(e,[],undefined))}],["throw",{canHandle:e=>c(e)&&i in e,serialize({value:e}){let t;return t=e instanceof Error?{isError:!0,value:{message:e.message,name:e.name,stack:e.stack}}:{isError:!1,value:e},[t,[]]},deserialize(e){if(e.isError)throw Object.assign(new Error(e.value.message),e.value);throw e.value}}]]);function u(e,t=globalThis,n=["*"]){t.addEventListener("message",(function o(a){if(!a||!a.data)return;if(!function(e,t){for(const n of e){if(t===n||"*"===n)return!0;if(n instanceof RegExp&&n.test(t))return!0}return!1}(n,a.origin))return void console.warn(`Invalid origin '${a.origin}' for comlink proxy`);const{id:c,type:l,path:p}=Object.assign({path:[]},a.data),m=(a.data.argumentList||[]).map(b);let g;try{const t=p.slice(0,-1).reduce(((e,t)=>e[t]),e),n=p.reduce(((e,t)=>e[t]),e);switch(l){case"GET":g=n;break;case"SET":t[p.slice(-1)[0]]=b(a.data.value),g=!0;break;case"APPLY":g=n.apply(t,m);break;case"CONSTRUCT":g=function(e){return Object.assign(e,{[r]:!0})}(new n(...m));break;case"ENDPOINT":{const{port1:t,port2:n}=new MessageChannel;u(e,n),g=function(e,t){return v.set(e,t),e}(t,[t])}break;case"RELEASE":g=void 0;break;default:return}}catch(e){g={value:e,[i]:0}}Promise.resolve(g).catch((e=>({value:e,[i]:0}))).then((n=>{const[r,a]=E(n);t.postMessage(Object.assign(Object.assign({},r),{id:c}),a),"RELEASE"===l&&(t.removeEventListener("message",o),f(t),s in e&&"function"==typeof e[s]&&e[s]())})).catch((e=>{const[n,r]=E({value:new TypeError("Unserializable return value"),[i]:0});t.postMessage(Object.assign(Object.assign({},n),{id:c}),r)}))})),t.start&&t.start()}function f(e){(function(e){return"MessagePort"===e.constructor.name})(e)&&e.close()}function p(e){if(e)throw new Error("Proxy has been released and is not useable")}function m(e){return w(e,{type:"RELEASE"}).then((()=>{f(e)}))}const g=new WeakMap,y="FinalizationRegistry"in globalThis&&new FinalizationRegistry((e=>{const t=(g.get(e)||0)-1;g.set(e,t),0===t&&m(e)}));function d(e,t=[],n=function(){}){let r=!1;const s=new Proxy(n,{get(n,o){if(p(r),o===a)return()=>{!function(e){y&&y.unregister(e)}(s),m(e),r=!0};if("then"===o){if(0===t.length)return{then:()=>s};const n=w(e,{type:"GET",path:t.map((e=>e.toString()))}).then(b);return n.then.bind(n)}return d(e,[...t,o])},set(n,o,a){p(r);const[s,i]=E(a);return w(e,{type:"SET",path:[...t,o].map((e=>e.toString())),value:s},i).then(b)},apply(n,a,s){p(r);const i=t[t.length-1];if(i===o)return w(e,{type:"ENDPOINT"}).then(b);if("bind"===i)return d(e,t.slice(0,-1));const[c,l]=h(s);return w(e,{type:"APPLY",path:t.map((e=>e.toString())),argumentList:c},l).then(b)},construct(n,o){p(r);const[a,s]=h(o);return w(e,{type:"CONSTRUCT",path:t.map((e=>e.toString())),argumentList:a},s).then(b)}});return function(e,t){const n=(g.get(t)||0)+1;g.set(t,n),y&&y.register(e,t,e)}(s,e),s}function h(e){const t=e.map(E);return[t.map((e=>e[0])),(n=t.map((e=>e[1])),Array.prototype.concat.apply([],n))];var n}const v=new WeakMap;function E(e){for(const[t,n]of l)if(n.canHandle(e)){const[r,o]=n.serialize(e);return[{type:"HANDLER",name:t,value:r},o]}return[{type:"RAW",value:e},v.get(e)||[]]}function b(e){switch(e.type){case"HANDLER":return l.get(e.name).deserialize(e.value);case"RAW":return e.value}}function w(e,t,n){return new Promise((r=>{const o=new Array(4).fill(0).map((()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16))).join("-");e.addEventListener("message",(function t(n){n.data&&n.data.id&&n.data.id===o&&(e.removeEventListener("message",t),r(n.data))})),e.start&&e.start(),e.postMessage(Object.assign({id:o},t),n)}))}}},t={};function n(r){var o=t[r];if(void 0!==o)return o.exports;var a=t[r]={exports:{}};return e[r](a,a.exports,n),a.exports}n.d=(e,t)=>{for(var r in t)n.o(t,r)&&!n.o(e,r)&&Object.defineProperty(e,r,{enumerable:!0,get:t[r]})},n.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),(()=>{const e=1/6,t=e=>0|Math.floor(e),r=new Float64Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);var o=n(590);const a=function(n=Math.random){const o=function(e){const t=new Uint8Array(512);for(let e=0;e<256;e++)t[e]=e;for(let n=0;n<255;n++){const r=n+~~(e()*(256-n)),o=t[n];t[n]=t[r],t[r]=o}for(let e=256;e<512;e++)t[e]=t[e-256];return t}(n),a=new Float64Array(o).map((e=>r[e%12*3])),s=new Float64Array(o).map((e=>r[e%12*3+1])),i=new Float64Array(o).map((e=>r[e%12*3+2]));return function(n,r,c){let l,u,f,p;const m=.3333333333333333*(n+r+c),g=t(n+m),y=t(r+m),d=t(c+m),h=(g+y+d)*e,v=n-(g-h),E=r-(y-h),b=c-(d-h);let w,A,S,k,O,T;v>=E?E>=b?(w=1,A=0,S=0,k=1,O=1,T=0):v>=b?(w=1,A=0,S=0,k=1,O=0,T=1):(w=0,A=0,S=1,k=1,O=0,T=1):E<b?(w=0,A=0,S=1,k=0,O=1,T=1):v<b?(w=0,A=1,S=0,k=0,O=1,T=1):(w=0,A=1,S=0,k=1,O=1,T=0);const L=v-w+e,M=E-A+e,P=b-S+e,R=v-k+2*e,j=E-O+2*e,x=b-T+2*e,C=v-1+.5,z=E-1+.5,N=b-1+.5,F=255&g,U=255&y,H=255&d;let I=.6-v*v-E*E-b*b;if(I<0)l=0;else{const e=F+o[U+o[H]];I*=I,l=I*I*(a[e]*v+s[e]*E+i[e]*b)}let D=.6-L*L-M*M-P*P;if(D<0)u=0;else{const e=F+w+o[U+A+o[H+S]];D*=D,u=D*D*(a[e]*L+s[e]*M+i[e]*P)}let W=.6-R*R-j*j-x*x;if(W<0)f=0;else{const e=F+k+o[U+O+o[H+T]];W*=W,f=W*W*(a[e]*R+s[e]*j+i[e]*x)}let G=.6-C*C-z*z-N*N;if(G<0)p=0;else{const e=F+1+o[U+1+o[H+1]];G*=G,p=G*G*(a[e]*C+s[e]*z+i[e]*N)}return 32*(l+u+f+p)}}(),s=(e,t,n,r=3)=>{let o=0,s=0;for(let i=0;i<r;i++){const r=1/(i+1);o+=r;const c=1<<i;s+=a(e*c,t*c,n*c)*r}return s/o};function i(e){return e*e*e}const c={createSineTerrain:(e,t,n,r,o)=>{const a=new Uint8Array(r),c=new Uint8Array(o);let l=0,u=0;for(let r=0;r<e;r++)for(let o=0;o<256;o++)for(let f=0;f<e;f++){const e=r+n[0],p=o+n[1],m=f+n[2],g=o/256,y=i((s(e/t,p/t,m/t,2)+1)/2);if(y>g){const e=139*y+0*(1-y),t=69*y+255*(1-y),n=19*y+0*(1-y);u++;const s=4*(u-1);Atomics.store(c,s,e),Atomics.store(c,s+1,t),Atomics.store(c,s+2,n),Atomics.store(c,s+3,255),l++;const i=4*(l-1);Atomics.store(a,i,r),Atomics.store(a,i+1,o),Atomics.store(a,i+2,f),Atomics.store(a,i+3,u-1)}}return{SIZE:[e,256,e],VOX:a.length}}};(0,o.p)(c)})()})();