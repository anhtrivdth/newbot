"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useMemo, useState } from "react";

type Product = { id:number; name:string; description:string; price:number; active:number; total_stock:number; available_stock:number; sold_stock:number };
type Stock = { id:number; value:string; hint:string; product_name:string; product_id:number; status:string; created_at:string };
type Settings = { store_name:string; bank_name:string; bank_account:string; bank_owner:string; payment_qr_url:string; support_username:string; customer_bot_configured:boolean; admin_bot_configured:boolean; bot_username:string };
type ManagedUser = { id:number; username:string; role:"admin"|"user"; active:number; created_at:string; product_count:number; stock_count:number; available_stock:number; bot_username:string|null; bot_verified_at:string|null };
type BotKind = "sales" | "admin";
type BotStep = "verified" | "token" | "start" | "code";
type BotConnection = { kind:BotKind; bot_username:string; bot_name:string; telegram_user_id:string|null; verified_at:string|null };
type Tab = "products" | "stock" | "settings" | "bots" | "users";

const blankSettings: Settings = { store_name:"BOTNF Store", bank_name:"", bank_account:"", bank_owner:"", payment_qr_url:"", support_username:"", customer_bot_configured:false, admin_bot_configured:false, bot_username:"" };
const money = new Intl.NumberFormat("vi-VN", { style:"currency", currency:"VND", maximumFractionDigits:0 });
const code = (id:number) => String(id).padStart(3, "0");

export default function Home() {
  const [accountUsername, setAccountUsername] = useState("");
  const [accountId, setAccountId] = useState(0);
  const [accountRole, setAccountRole] = useState<"admin"|"user">("user");
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [settings, setSettings] = useState<Settings>(blankSettings);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [botConnections,setBotConnections]=useState<Partial<Record<BotKind,BotConnection>>>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [editingStockId,setEditingStockId]=useState<number|null>(null);
  const [editingStockValue,setEditingStockValue]=useState("");
  const [selectedStockIds,setSelectedStockIds]=useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mustChangePassword,setMustChangePassword]=useState(false);
  const [botSteps,setBotSteps]=useState<Record<BotKind,BotStep>>({sales:"token",admin:"token"});
  const [botLinks,setBotLinks]=useState<Record<BotKind,string>>({sales:"",admin:""});

  const api = useCallback(async (path:string, options:RequestInit={}) => {
    const response = await fetch(path, { ...options, headers:{ "Content-Type":"application/json", ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Yêu cầu không thành công");
    return data;
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const me=await api("/api/auth/me");
      setAccountUsername(me.user.username); setAccountId(me.user.id); setAccountRole(me.user.role);
      const [p,s,c,b,u]=await Promise.all([api("/api/admin/products"),api("/api/admin/stock"),api("/api/admin/settings"),api("/api/account/bot/status"),me.user.role==="admin"?api("/api/admin/users"):Promise.resolve({users:[]})]);
      setProducts(p.products); setStock(s.stock); setSelectedStockIds([]); setSettings({ ...blankSettings, ...c.settings });
      setBotConnections(b.connections??{});setBotSteps({sales:b.connections?.sales?.verified_at?"verified":"token",admin:b.connections?.admin?.verified_at?"verified":"token"});setUsers(u?.users??[]);
      setConnected(true); setNotice("");
    } catch (error) { setConnected(false); setNotice(error instanceof Error ? error.message : "Không thể kết nối"); }
    finally { setBusy(false); }
  }, [api]);

  async function authenticate(event:FormEvent<HTMLFormElement>) { event.preventDefault(); const data=new FormData(event.currentTarget); try{setBusy(true);const result=await api("/api/auth/login",{method:"POST",body:JSON.stringify({username:data.get("username"),password:data.get("password")})});setAccountUsername(result.user.username);if(result.user.mustChangePassword){setMustChangePassword(true);setNotice("");return}await load()}catch(error){setNotice(error instanceof Error?error.message:"Không thể đăng nhập")}finally{setBusy(false)} }
  async function changePassword(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);try{setBusy(true);await api("/api/auth/change-password",{method:"POST",body:JSON.stringify({password:data.get("password"),confirmPassword:data.get("confirmPassword")})});setMustChangePassword(false);setNotice("Đã đổi mật khẩu thành công.");await load()}catch(error){setNotice(error instanceof Error?error.message:"Không thể đổi mật khẩu")}finally{setBusy(false)}}
  async function logout(){await api("/api/auth/me",{method:"DELETE"});setConnected(false);setMustChangePassword(false);setProducts([]);setStock([]);setSelectedStockIds([]);setEditingStockId(null);setUsers([]);setBotConnections({});setAccountRole("user");setTab("products")}

  async function updateUser(id:number,active:boolean) {
    try { setBusy(true); await api("/api/admin/users",{method:"PATCH",body:JSON.stringify({id,active})}); setNotice("Đã cập nhật tài khoản."); await load(); }
    catch(error){setNotice(error instanceof Error?error.message:"Không thể cập nhật user")} finally{setBusy(false)}
  }

  async function resetUserPassword(id:number,username:string) {
    if(!window.confirm(`Reset mật khẩu của ${username} về 123456? Dữ liệu kho vẫn được giữ nguyên.`))return;
    try { setBusy(true); await api("/api/admin/users",{method:"PATCH",body:JSON.stringify({id,resetPassword:true})}); setNotice(`Đã reset mật khẩu ${username} về 123456. User phải đổi mật khẩu khi đăng nhập.`); await load(); }
    catch(error){setNotice(error instanceof Error?error.message:"Không thể reset mật khẩu")} finally{setBusy(false)}
  }

  async function beginBotConnect(event:FormEvent<HTMLFormElement>,kind:BotKind){event.preventDefault();const data=new FormData(event.currentTarget);try{setBusy(true);const result=await api("/api/account/bot/start",{method:"POST",body:JSON.stringify({token:data.get("botToken"),adminTelegramId:kind==="admin"?data.get("adminTelegramId"):undefined,kind})});setBotLinks((current)=>({...current,[kind]:result.deepLink}));setBotSteps((current)=>({...current,[kind]:"start"}));setNotice(`Đã kiểm tra @${result.bot.username}. Hãy xác minh chính chủ.`)}catch(error){setNotice(error instanceof Error?error.message:"Token không hợp lệ")}finally{setBusy(false)}}
  async function requestBotCode(kind:BotKind){try{setBusy(true);await api("/api/account/bot/send-code",{method:"POST",body:JSON.stringify({kind})});setBotSteps((current)=>({...current,[kind]:"code"}));setNotice("Đã gửi mã 4 số vào Telegram.")}catch(error){setNotice(error instanceof Error?error.message:"Chưa nhận được lệnh Start")}finally{setBusy(false)}}
  async function verifyBotCode(event:FormEvent<HTMLFormElement>,kind:BotKind){event.preventDefault();const data=new FormData(event.currentTarget);try{setBusy(true);await api("/api/account/bot/verify",{method:"POST",body:JSON.stringify({code:data.get("code"),kind})});setBotSteps((current)=>({...current,[kind]:"token"}));setNotice(`Đã liên kết ${kind==="sales"?"Bot bán hàng":"Bot thông báo admin"}.`);await load()}catch(error){setNotice(error instanceof Error?error.message:"Mã xác minh không đúng")}finally{setBusy(false)}}

  const totals = useMemo(() => ({
    available: products.reduce((n,p) => n + Number(p.available_stock || 0), 0),
    sold: products.reduce((n,p) => n + Number(p.sold_stock || 0), 0),
  }), [products]);

  async function saveProduct(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const payload = { name:data.get("name"), description:data.get("description"), price:Number(data.get("price")), active:data.get("active") === "on" };
    try { setBusy(true); await api(editing ? `/api/admin/products/${editing.id}` : "/api/admin/products", { method:editing ? "PATCH" : "POST", body:JSON.stringify(payload) }); setNotice(editing ? "Đã cập nhật sản phẩm." : "Đã tạo sản phẩm."); setEditing(null); form.reset(); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Có lỗi"); } finally { setBusy(false); }
  }

  async function removeProduct(id:number) {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    try { setBusy(true); await api(`/api/admin/products/${id}`, { method:"DELETE" }); setConfirmDelete(null); setNotice("Đã xóa sản phẩm."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Có lỗi"); } finally { setBusy(false); }
  }

  async function importKeys(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try { setBusy(true); const result = await api("/api/admin/stock", { method:"POST", body:JSON.stringify({ productId:Number(data.get("productId")), keys:data.get("keys") }) }); form.reset(); setNotice(`Đã nhập ${result.imported} key.`); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Có lỗi"); } finally { setBusy(false); }
  }

  async function saveStockKey(id:number){try{setBusy(true);await api("/api/admin/stock",{method:"PATCH",body:JSON.stringify({id,value:editingStockValue})});setEditingStockId(null);setEditingStockValue("");setNotice("Đã cập nhật key.");await load()}catch(error){setNotice(error instanceof Error?error.message:"Không thể sửa key")}finally{setBusy(false)}}
  async function deleteStockKey(id:number){if(!window.confirm(`Xóa vĩnh viễn key #${id}? Thao tác này không thể hoàn tác.`))return;try{setBusy(true);await api("/api/admin/stock",{method:"DELETE",body:JSON.stringify({id})});setNotice("Đã xóa key khỏi kho.");await load()}catch(error){setNotice(error instanceof Error?error.message:"Không thể xóa key")}finally{setBusy(false)}}
  function toggleStockSelection(id:number){setSelectedStockIds((current)=>current.includes(id)?current.filter((value)=>value!==id):[...current,id])}
  function toggleProductStock(productId:number){const available=stock.filter((item)=>item.product_id===productId&&item.status==="AVAILABLE").map((item)=>item.id);const allSelected=available.length>0&&available.every((id)=>selectedStockIds.includes(id));setSelectedStockIds((current)=>allSelected?current.filter((id)=>!available.includes(id)):[...new Set([...current,...available])])}
  async function deleteSelectedStock(){if(!selectedStockIds.length)return;if(!window.confirm(`Xóa vĩnh viễn ${selectedStockIds.length} key đã chọn? Thao tác này không thể hoàn tác.`))return;try{setBusy(true);const result=await api("/api/admin/stock",{method:"DELETE",body:JSON.stringify({ids:selectedStockIds})});setNotice(`Đã xóa ${result.deleted} key khỏi kho.`);setSelectedStockIds([]);await load()}catch(error){setNotice(error instanceof Error?error.message:"Không thể xóa các key đã chọn")}finally{setBusy(false)}}

  async function saveSettings(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { setBusy(true); await api("/api/admin/settings", { method:"PATCH", body:JSON.stringify(settings) }); setNotice("Đã lưu cấu hình thanh toán và bot."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Có lỗi"); } finally { setBusy(false); }
  }

  async function uploadQr(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try { setBusy(true); const response = await fetch("/api/admin/payment-qr", { method:"POST", body:data }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setNotice("Đã tải ảnh QR thanh toán."); form.reset(); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Không thể tải QR"); } finally { setBusy(false); }
  }

  async function deleteQr() {
    try { setBusy(true); await api("/api/admin/payment-qr", { method:"DELETE" }); setNotice("Đã xóa ảnh QR."); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Không thể xóa QR"); } finally { setBusy(false); }
  }

  if(mustChangePassword)return <main className="login"><section className="login-box"><div className="logo">NF</div><p className="kicker">BẢO MẬT LẦN ĐẦU</p><h1>Đổi mật khẩu tạm.</h1><p className="sub">Tài khoản <b>{accountUsername}</b> phải đặt mật khẩu riêng trước khi truy cập kho.</p><form onSubmit={changePassword}><label>Mật khẩu mới<input name="password" type="password" minLength={8} placeholder="Tối thiểu 8 ký tự" required autoFocus/></label><label>Xác nhận mật khẩu<input name="confirmPassword" type="password" minLength={8} required/></label><button disabled={busy}>{busy?"Đang cập nhật…":"Đổi mật khẩu & vào kho"}</button></form>{notice&&<p className="error">{notice}</p>}<button className="auth-switch" onClick={()=>void logout()}>Đăng xuất</button></section></main>;

  if (!connected) return <main className="login"><section className="login-box">
    <div className="logo">NF</div><p className="kicker">BOTNF ACCOUNT</p><h1>Đăng nhập kho của bạn.</h1><p className="sub">Tài khoản mới chỉ được cấp bởi Bot thông báo admin. Web không mở đăng ký công khai.</p>
    <form onSubmit={authenticate}><label>Username<input name="username" type="text" autoComplete="username" placeholder="Nhập username" required autoFocus/></label><label>Mật khẩu<input name="password" type="password" autoComplete="current-password" placeholder="Nhập mật khẩu" required/></label><button disabled={busy}>{busy?"Đang xử lý…":"Đăng nhập"}</button></form><p className="auth-help">Chưa có tài khoản? Liên hệ Telegram <a href="https://t.me/LuciferHereee" target="_blank" rel="noreferrer">@LuciferHereee</a> để được cấp.</p>{notice && <p className="error">{notice}</p>}
  </section></main>;

  return <main className="shell">
    <aside><div className="side-head"><div className="logo">NF</div><div><b>botnf</b><small>Control center</small></div></div><nav>
      <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}><span>01</span>Sản phẩm</button>
      <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}><span>02</span>Kho key</button>
      <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>03</span>Thanh toán</button>
      <button className={tab === "bots" ? "active" : ""} onClick={() => setTab("bots")}><span>04</span>Cấu hình Bot</button>
      {accountRole==="admin"&&<button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><span>05</span>Người dùng</button>}
    </nav><div className="side-foot"><i></i><div><b>{accountUsername || "Tài khoản BOTNF"}</b><small>{accountRole}</small><button onClick={() => void logout()}>Đăng xuất</button></div></div></aside>
    <section className="content"><header><div><p className="kicker">BOTNF / {tab.toUpperCase()}</p><h1>{tab === "products" ? "Sản phẩm" : tab === "stock" ? "Kho key" : tab === "users" ? "Quản lý người dùng" : tab === "bots" ? "Cấu hình Bot Telegram" : "Thiết lập thanh toán"}</h1></div><div className="head-actions"><span>{tab==="users"?`${users.length} tài khoản`:`${totals.available} key sẵn sàng`}</span><button className="quiet" onClick={() => void load()}>↻ Làm mới</button></div></header>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      {tab === "products" && <div className="page-grid"><section className="card grow"><div className="card-head"><div><p className="kicker">DANH MỤC</p><h2>{products.length} sản phẩm</h2></div><div className="mini-stats"><span><b>{totals.available}</b> còn</span><span><b>{totals.sold}</b> đã bán</span></div></div>
        <div className="product-table"><div className="table-row table-label"><span>Mã</span><span>Sản phẩm</span><span>Giá bán</span><span>Tồn kho</span><span>Trạng thái</span><span></span></div>{products.map((p) => <div className="table-row" key={p.id}><code>{code(p.id)}</code><div className="product-name"><b>{p.name}</b><small>{p.description || "Không có mô tả"}</small></div><strong>{money.format(p.price)}</strong><span>{p.available_stock || 0} / {p.total_stock || 0}</span><Status active={Boolean(p.active)}/><div className="actions"><button onClick={() => { setEditing(p); setConfirmDelete(null); }} aria-label={`Sửa ${p.name}`}>Sửa</button><button className={confirmDelete === p.id ? "confirm" : "delete"} onClick={() => void removeProduct(p.id)}>{confirmDelete === p.id ? "Bấm lại để xóa" : "Xóa"}</button></div></div>)}</div>
      </section><section className="card form-card"><p className="kicker">{editing ? `CHỈNH SỬA #${code(editing.id)}` : "THÊM MỚI"}</p><h2>{editing ? "Cập nhật sản phẩm" : "Tạo sản phẩm"}</h2><form key={editing?.id ?? "new"} onSubmit={saveProduct}><label>Tên sản phẩm<input name="name" defaultValue={editing?.name} placeholder="Netflix Premium 1 tháng" required/></label><label>Mô tả<textarea name="description" defaultValue={editing?.description} rows={3} placeholder="Mô tả ngắn cho khách hàng"/></label><label>Giá bán (VND)<input name="price" type="number" min="0" step="1000" defaultValue={editing?.price} placeholder="89000" required/></label>{editing && <label className="switch"><input name="active" type="checkbox" defaultChecked={Boolean(editing.active)}/><span></span>Hiển thị trên bot</label>}<button disabled={busy}>{editing ? "Lưu thay đổi" : "+ Tạo sản phẩm"}</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Hủy chỉnh sửa</button>}</form></section></div>}

      {tab === "stock" && <div className="page-grid stock-grid"><section className="card form-card"><p className="kicker">NHẬP KHO</p><h2>Thêm key</h2><p className="helper">Mỗi dòng là một key. Key được hiển thị trực tiếp để kiểm tra nhanh.</p><form onSubmit={importKeys}><label>Sản phẩm<select name="productId" defaultValue="" required><option value="" disabled>Chọn mã kho</option>{products.map((p) => <option key={p.id} value={p.id}>#{code(p.id)} — {p.name}</option>)}</select></label><label>Danh sách key<textarea name="keys" rows={12} placeholder={"account@example.com|password\nAAAA-BBBB-CCCC"} required/></label><button disabled={busy}>Nhập kho</button></form></section><section className="card grow stock-manager"><div className="card-head"><div><p className="kicker">QUẢN LÝ KEY THEO SẢN PHẨM</p><h2>{stock.length} key trong kho</h2></div><div className="stock-bulk"><span>{selectedStockIds.length} đã chọn</span><button className="delete" disabled={busy||!selectedStockIds.length} onClick={()=>void deleteSelectedStock()}>Xóa key đã chọn</button></div></div><p className="helper">Chọn từng key hoặc chọn cả nhóm sản phẩm. Chỉ key Sẵn sàng được phép xóa.</p><div className="stock-groups">{products.map((product)=>{const rows=stock.filter((item)=>item.product_id===product.id);if(!rows.length)return null;const available=rows.filter((item)=>item.status==="AVAILABLE");const allSelected=available.length>0&&available.every((item)=>selectedStockIds.includes(item.id));return <section className="stock-product-group" key={product.id}><div className="stock-group-head"><label><input type="checkbox" checked={allSelected} disabled={!available.length} onChange={()=>toggleProductStock(product.id)}/><span><b>#{code(product.id)}</b> · {product.name}</span></label><small>{rows.length} key · {available.length} có thể chọn</small></div><div className="stock-list"><div className="stock-row stock-label"><span></span><span>ID</span><span>Nội dung key</span><span>Trạng thái</span><span>Thao tác</span></div>{rows.map((s)=><div className="stock-row" key={s.id}><input className="stock-checkbox" type="checkbox" checked={selectedStockIds.includes(s.id)} disabled={s.status!=="AVAILABLE"} onChange={()=>toggleStockSelection(s.id)}/><code>#{s.id}</code>{editingStockId===s.id?<div className="stock-editor"><input value={editingStockValue} onChange={(event)=>setEditingStockValue(event.target.value)} autoFocus/><button disabled={busy||!editingStockValue.trim()} onClick={()=>void saveStockKey(s.id)}>Lưu</button><button onClick={()=>{setEditingStockId(null);setEditingStockValue("")}}>Hủy</button></div>:<div className="stock-value"><code>{s.value}</code></div>}<StockStatus value={s.status}/><div className="stock-actions"><button disabled={busy||s.status!=="AVAILABLE"} onClick={()=>{setEditingStockId(s.id);setEditingStockValue(s.value)}}>Sửa</button><button className="delete" disabled={busy||s.status!=="AVAILABLE"} onClick={()=>void deleteStockKey(s.id)}>Xóa</button></div></div>)}</div></section>})}{!stock.length&&<div className="qr-empty">Kho chưa có key</div>}</div></section></div>}

      {tab === "settings" && <div className="settings-grid">
        <section className="settings-stack">
          <form className="card settings-form" onSubmit={saveSettings}><div className="card-head"><div><p className="kicker">THANH TOÁN</p><h2>Ngân hàng</h2></div></div><div className="form-cols"><label>Tên cửa hàng<input value={settings.store_name} onChange={(e) => setSettings({...settings,store_name:e.target.value})}/></label><label>Ngân hàng<input value={settings.bank_name} onChange={(e) => setSettings({...settings,bank_name:e.target.value})} placeholder="MB Bank"/></label><label>Số tài khoản<input value={settings.bank_account} onChange={(e) => setSettings({...settings,bank_account:e.target.value})} placeholder="0123456789"/></label><label>Chủ tài khoản<input value={settings.bank_owner} onChange={(e) => setSettings({...settings,bank_owner:e.target.value})} placeholder="NGUYEN VAN A"/></label><label className="full">Telegram hỗ trợ<input value={settings.support_username} onChange={(e) => setSettings({...settings,support_username:e.target.value})} placeholder="@botnf_support"/></label></div><button disabled={busy}>Lưu cấu hình</button></form>
          <form className="card upload-card" onSubmit={uploadQr}><div><p className="kicker">QR THANH TOÁN</p><h2>Tải ảnh QR</h2><p className="helper">Dùng PNG, JPG hoặc WEBP, tối đa 5MB.</p></div><label className="file-input"><input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/><span>Chọn ảnh QR</span></label><button disabled={busy}>Tải lên</button></form>
        </section>
        <section className="card bot-card"><p className="kicker">QR ĐANG DÙNG</p><h2>Xem trước thanh toán</h2>{settings.payment_qr_url ? <div className="qr-preview"><img src={settings.payment_qr_url} alt="Xem trước QR thanh toán"/><small>Ảnh riêng của shop #{accountId}</small><button className="delete-qr" onClick={() => void deleteQr()}>Xóa QR</button></div> : <div className="qr-empty">Chưa tải ảnh QR</div>}</section>
      </div>}

      {tab === "bots" && <div className="bot-config-page"><section className="card bot-intro"><p className="kicker">KẾT NỐI RIÊNG THEO SHOP</p><h2>Hai bot, hai nhiệm vụ độc lập</h2><p>Mỗi tài khoản BOTNF lưu token riêng. Bot bán hàng phục vụ khách; Bot thông báo admin chỉ nhận đơn, cảnh báo kho và nút xác nhận thanh toán.</p><div className="bot-flow"><span>Shop #{accountId}</span><b>→</b><span>Bot bán hàng</span><b>+</b><span>Bot admin</span></div></section><div className="bot-pair">{(["sales","admin"] as BotKind[]).map((kind)=>{const connection=botConnections[kind];const title=kind==="sales"?"Bot bán hàng":"Bot thông báo admin";const description=kind==="sales"?"Menu sản phẩm, tạo đơn, QR và giao key cho khách.":"Nhận đơn mới, cảnh báo refill, xác nhận tiền hoặc hủy đơn.";const step=botSteps[kind];return <section className="card bot-connect-card" key={kind}><div className="bot-card-title"><div className={`bot-role ${kind}`}>{kind==="sales"?"BÁN":"ADMIN"}</div><div><p className="kicker">{kind.toUpperCase()} BOT</p><h2>{title}</h2></div></div><p className="helper">{description}</p>{step==="verified"&&connection?.verified_at?<div className="verified-box"><b>✓ @{connection.bot_username}</b><p>Đã xác minh · {kind==="admin"?"Telegram Admin ID":"Telegram ID xác minh"}: {connection.telegram_user_id}</p><button onClick={()=>setBotSteps((current)=>({...current,[kind]:"token"}))}>Thay bot khác</button></div>:<div className="bot-wizard">{step==="token"&&<form onSubmit={(event)=>void beginBotConnect(event,kind)}><label>Token {title}<input type="password" name="botToken" placeholder="123456:AA..." autoComplete="off" required/></label>{kind==="admin"&&<label>Telegram Admin ID<input type="text" name="adminTelegramId" inputMode="numeric" pattern="[0-9]{5,20}" defaultValue={connection?.telegram_user_id??""} placeholder="Ví dụ: 1801754034" required/><small>Đây là ID Telegram của người quản lý shop, không phải admin tổng. Vào <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer">@userinfobot</a>, bấm /start và sao chép ID số.</small></label>}<button disabled={busy}>Kiểm tra token</button></form>}{step==="start"&&<div><p><b>Bước 1:</b> mở đúng bot bằng liên kết riêng và bấm Start.{kind==="admin"?" Phải dùng đúng tài khoản Telegram có ID đã nhập.":""}</p><a className="telegram-link" href={botLinks[kind]} target="_blank" rel="noreferrer">Mở @{botLinks[kind].split("/").pop()?.split("?")[0]}</a><p><b>Bước 2:</b> quay lại đây để nhận mã.</p><button onClick={()=>void requestBotCode(kind)} disabled={busy}>Tôi đã bấm Start</button></div>}{step==="code"&&<form onSubmit={(event)=>void verifyBotCode(event,kind)}><label>Mã xác minh 4 số<input name="code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="0000" required autoFocus/></label><button disabled={busy}>Xác minh {title}</button></form>}</div>}<div className="security-note"><b>Không dùng chung bot</b><p>Một Telegram bot chỉ được gắn với một shop và một vai trò. Token được mã hóa trước khi lưu.</p></div></section>})}</div></div>}

      {tab === "users" && accountRole==="admin" && <section className="card users-card"><div className="card-head"><div><p className="kicker">ROLE ADMIN DUY NHẤT</p><h2>{users.length} tài khoản hệ thống</h2></div><p className="helper">Tài khoản mới chỉ được cấp bằng lệnh <code>/reg username</code> trên Bot admin. Reset pass đưa mật khẩu về <code>123456</code> nhưng giữ nguyên toàn bộ dữ liệu.</p></div><div className="users-table"><div className="user-row user-label"><span>Username</span><span>Role</span><span>Kho</span><span>Telegram bot</span><span>Trạng thái</span><span>Reset pass</span><span>Thao tác</span></div>{users.map((u)=><div className="user-row" key={u.id}><div className="user-identity"><b>{u.username}</b><small>#{u.id} · {new Date(u.created_at).toLocaleDateString("vi-VN")}</small></div><span className={`role-badge ${u.role}`}>{u.role}</span><div className="user-metric"><b>{u.product_count} SP</b><small>{u.available_stock}/{u.stock_count} key sẵn sàng</small></div><div className="user-metric"><b>{u.bot_verified_at?`@${u.bot_username}`:"Chưa kết nối"}</b><small>{u.bot_verified_at?"Đã xác minh":"Chưa có bot"}</small></div><span className={`pill ${u.active?"on":"off"}`}>{u.active?"Hoạt động":"Đã khóa"}</span><div className="user-actions"><button disabled={busy||u.id===accountId} onClick={()=>void resetUserPassword(u.id,u.username)}>Reset 123456</button></div><div className="user-actions"><button className="danger" disabled={busy||u.id===accountId} onClick={()=>void updateUser(u.id,!u.active)}>{u.active?"Khóa":"Mở khóa"}</button></div></div>)}</div></section>}
    </section>
  </main>;
}

function Status({active}:{active:boolean}) { return <span className={`pill ${active ? "on" : "off"}`}>{active ? "Đang bán" : "Đã tắt"}</span>; }
function StockStatus({value}:{value:string}) { const label:Record<string,string>={AVAILABLE:"Sẵn sàng",RESERVED:"Đang giữ",SOLD:"Đã bán"}; return <span className={`pill stock-${value.toLowerCase()}`}>{label[value] ?? value}</span>; }
