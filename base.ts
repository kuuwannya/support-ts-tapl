import { error, parseBasic, typeShow, parseBasic2, parseObj, parseTaggedUnion, parseRecFunc } from "npm:tiny-ts-parser";
type Type =
| { tag: "Boolean" }
| { tag: "Number" }
| { tag: "Func"; params: Param[]; retType: Type }
| { tag: "Object"; props: PropertyType[] }
| { tag: "TaggedUnion"; variants: VariantType[] };

type Term =
| { tag: "true" }
| { tag: "false" }
| { tag: "if"; cond: Term; thn: Term; els: Term }
| { tag: "number"; n: number }
| { tag: "add"; left: Term; right: Term }
| { tag: "var"; name: string }
| { tag: "func"; params: Param[]; body: Term }
| { tag: "call"; func: Term; args: Term[] }
| { tag: "seq"; body: Term; rest: Term }
| { tag: "const"; name: string; init: Term; rest: Term }
//seq2: restがない const2: restがない
| { tag: "seq2"; body: Term[] }
| { tag: "const2"; names: string[]; inits: Term[] }
| { tag: "objectNew"; props: PropertyTerm[] }
| { tag: "objectGet"; obj: Term; propName: string }
| { tag: "taggedUnionNew"; tagLabel: string; props: PropertyTerm[]; as: Type }
| { tag: "taggedUnionGet"; varName: string; clauses: VariantTerm[] }
| { tag: "recFunc"; funcName: string; paramas: Param[]; retType: Type; body: Term; rest: Term };

type Param = { name: string; type: Type };
type TypeEnv = Record<string, Type>;
type PropertyTerm = { name: string; term: Term };
type PropertyType = { name: string; type: Type };
type VariantType = { tagLabel: string; props: PropertyType[] };
type VariantTerm = { tagLabel: string; term: Term };

type NumOrBool = { tag: "num"; numVal: number } | { tag: "bool"; boolVal: boolean };

const numOrBool42 = { tag: "num", numVal: 42 } satisfies NumOrBool;
const numOrBoolTrue = { tag: "bool", boolVal: true } satisfies NumOrBool;

const f = (x: NumOrBool) => {
  switch (x.tag) {
    case "num": {
      return x.numVal
    }
    case "bool": {
      return -1;
    }
  }
};

f(numOrBool42);
f(numOrBoolTrue);

//タグ付きunion型をサポート
// { tag: 文字列, name1: 型; name2: 型; ...} satisfies タグ付きunion型
// switch 変数名.tagのように分類
// 指定されている型以外のもので定義してある場合はエラーが出る


function typeEq(ty1: Type, ty2: Type): boolean {
  switch (ty2.tag) {
    case "Boolean":
      return ty1.tag === "Boolean";
    case "Number":
      return ty1.tag === "Number";
    case "Func":
      if (ty1.tag !== "Func") return false;
      if (ty1.params.length !== ty2.params.length) return false;
      for (let i = 0; i < ty1.params.length; i++) {
        if (!typeEq(ty1.params[i].type, ty2.params[i].type)) return false;
      }
      if(!typeEq(ty1.retType, ty2.retType)) return false;
      return true;
    case "Object":
      if (ty1.tag !== "Object") return false;
      if (ty1.props.length !== ty2.props.length) return false;
      //propsにAのプロップスが全てできる
      for (const prop2 of ty2.props) {
        const prop1 = ty1.props.find((prop1) => prop1.name === prop2.name);
        if (!prop1) return false;
        if (!typeEq(prop1.type, prop2.type)) return false;
      }
  }
}


function typecheck(t: Term, tyEnv: TypeEnv): Type {
  switch (t.tag) {
    case "true":
      return { tag: "Boolean" };
    case "false":
      return { tag: "Boolean" };
    case "if": {
      const condTy = typecheck(t.cond, tyEnv);
      if (condTy.tag !== "Boolean") error("boolean type expected", t.cond);
      const thnTy = typecheck(t.thn, tyEnv);
      const elsTy = typecheck(t.els, tyEnv);
      if (!typeEq(thnTy, elsTy)) {
        error("then and else have different types", t);
      }
      return thnTy;
    }
    case "number":
      return { tag: "Number" };
    case "add": {
      const leftTy = typecheck(t.left, tyEnv);
      if (leftTy.tag !== "Number") error("number expected", t.left);
      const rightTy = typecheck(t.right, tyEnv);
      if (rightTy.tag !== "Number") error("number expected", t.right);
      return { tag: "Number" };
    }
    case "var": {
      if (tyEnv[t.name] === undefined) error(`unknown variable: ${t.name}`, t);
      return tyEnv[t.name];
    }
    case "func": {
      const newTyEnv = { ...tyEnv };
      for (const {name, type} of t.params) {
        newTyEnv[name] = type;
      }
      const retType = typecheck(t.body, newTyEnv);
      return  { tag: "Func", params: t.params, retType };
    }
    case "recFunc": {
      const funcTy: Type = { tag: "Func", params: t.params, retType: t.retType };
      const newTyEnv = { ...tyEnv };
      for (const {name, type} of t.params) {
        newTyEnv[name] = type;
      }
      newTyEnv[t.funcName] = funcTy;
      const retType = typecheck(t.body, newTyEnv);
      if(!typeEq(retType, t.retType)) error ("wrong return type", t);
      const newerTyEnv2 = { ...tyEnv, [t.funcName]: funcTy };
      return  typecheck(t.rest, newerTyEnv2);
    }
    case "call": {
      const funcTy = typecheck(t.func, tyEnv);
      if (funcTy.tag !== "Func") error("function type expected", t.func);
      if (funcTy.params.length !== t.args.length) error("wrong number of arguments", t);
      for (let i = 0; i < t.args.length; i++) {
        const argTy = typecheck(t.args[i], tyEnv);
        const paramTy = funcTy.params[i].type;
        if (!typeEq(argTy, paramTy)) {
          error("parameter type mismatch", t.args[i]);
        }
      }
      return funcTy.retType;
    }
    case "seq": {
      typecheck(t.body, tyEnv);
      return typecheck(t.rest, tyEnv);
    }
    case "const": {
      const ty = typecheck(t.init, tyEnv);
      const newTyEnv = { ...tyEnv, [t.name]: ty };
      return typecheck(t.rest, newTyEnv);
    }
    case "objectNew": {
      const props = t.props.map
      (({ name, term }) => ({name, type: typecheck(term, tyEnv) }));
      //上記は省略形式
      //((prop) => ({ name: prop.name, type: typecheck(prop.term, tyEnv) }));
      return { tag: "Object", props };
    }
    case "objectGet": {
      const objTy = typecheck(t.obj, tyEnv);
      if (objTy.tag !== "Object") error("object type expected", t.obj);
      const prop = objTy.props.find((prop) => prop.name === t.propName);
      if (!prop) error(`unknown property name: ${t.propName}`, t);
      return prop.type;
    }
    case "taggedUnionNew": {
      const asTy = t.as; // 定義している型
      //定義している型がunion型でない場合はエラー
      if (asTy.tag !== "TaggedUnion") {
        error(`"as" must have a tagged union type`, t);
      }
      const variant = asTy.variants.find((variant) => variant.tagLabel === t.tagLabel);
      if (!variant) error (`unknown variant label: ${t.tagLabel}`, t);
      //ここもオブジェクトと同じ。長さがいらないのは、union型でどっちかの値があれば良いから
      for (const prop1 of t.props) {
        const prop2 = variant.props.find((prop2) => prop2.name === prop1.name);
        if (!prop2) error(`unknown property name: ${prop1.name}`, t);
        const actualTy = typecheck(prop1.term, tyEnv);
        if( !typeEq(actualTy, prop2.type)) {
          error(`property type mismatch for property: ${prop1.name}`, prop1.term);
        }
      }
      return t.as;
    }
    //getの時はどんな呼び出しになる？
    case "taggedUnionGet": {
      const variantTy = tyEnv[t.varName];
      if (variantTy.tag !== "TaggedUnion") {
        error(`variable: ${t.varName} must have a tagged union type`, t);
      }
      let retTy: Type | null = null;
      for (const clause of t.clauses) {
        const variant = variantTy.variants.find((variant) => variant.tagLabel === clause.tagLabel);
        //variantが見つからなかったエラー
        if(!variant) {
          error(`tagged union has no case: ${clause.tagLabel}`, clause.term);
        }
        //型のチェック ???
        const localTy: Type = { tag: "Object", props: variant.props };
        const newTyEnv = { ...tyEnv, [t.varName]: localTy };
        const clauseTy = typecheck(clause.term, newTyEnv);
        if (retTy) {
          if (!typeEq(retTy, clauseTy)) {
            error("clauses has different type", clause.term);
          } else {
            retTy = clauseTy;
          }
        }
      }
      if(variantTy.variants.length !== t.clauses.length) {
        error("switch case is not exhaustive", t);
      }
      return retTy!;
    }
    // case "seq2": {
    //   let lastTy: Type | null = null;
    //   for (const term of t.body) {
    //     if (term.tag === "const2"){
    //       const ty = typecheck(term.init, tyEnv);
    //       tyEnv = { ...tyEnv, [term.name]: ty };
    //     } else {
    //       lastTy = typecheck(term, tyEnv);
    //     }
    //   }
    //   return lastTy!;
    // }
    // case "const2":
    //   throw "unreachable";
  }
}
//console.log(typecheck(parseBasic("const f = (x: number) => f(x);")), {});
console.log(typecheck(parseRecFunc(`function f(x: number): number { return f(x); } f(0)`), {}));

// {
//   tag: "recFunc",
//   funcName: "f",
//   params: [ { name: "x", type: { tag: "Number" } } ],
//   retType: { tag: "Number" },
//   body: {
//     tag: "call",
//     func: {
//       tag: "var",
//       name: "f",
//       loc: { end: { column: 40, line: 1 }, start: { column: 39, line: 1 } }
//     },
//     args: [
//       {
//         tag: "var",
//         name: "x",
//         loc: { end: [Object], start: [Object] }
//       }
//     ],
//     loc: { end: { column: 43, line: 1 }, start: { column: 39, line: 1 } }
//   },
//   rest: {
//     tag: "var",
//     name: "f",
//     loc: { end: { column: 46, line: 1 }, start: { column: 0, line: 1 } }
//   },
//   loc: { end: { column: 46, line: 1 }, start: { column: 0, line: 1 } }
// }
