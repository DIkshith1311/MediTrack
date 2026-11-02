import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
async function main(){
 const password=process.env.DEMO_ADMIN_PASSWORD;
 if(!password) throw new Error('Load .env and seed the application before capturing screenshots.');
 const base=process.env.SCREENSHOT_BASE_URL??'http://localhost:3000';
 const output=resolve('docs/screenshots');await mkdir(output,{recursive:true});
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(base);await page.getByRole('heading',{name:'Sign in to your pharmacy'}).waitFor();
  await page.screenshot({path:resolve(output,'01-login.png'),fullPage:true});
  await page.getByLabel('Email address').fill('admin@meditrack.local');
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in →',exact:true}).click();
  await page.getByText('Usable stock',{exact:true}).waitFor();
  await page.screenshot({path:resolve(output,'02-dashboard.png'),fullPage:true});
  for(const [tab,name] of [['Inventory','03-inventory'],['Batches','04-batches'],['Billing','05-billing'],['Smart search','06-search'],['Suppliers','07-suppliers'],['Sales','08-sales']]){
   await page.locator('nav button').filter({hasText:tab}).click();
   await page.locator('.page-heading h1').filter({hasText:tab}).waitFor();
   if(tab==='Billing'){
    const available=page.locator('.medicine-list > button');
    if(await available.count())await available.first().click();
   }
   await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});
  }
  console.log('Saved 8 actual application screenshots to docs/screenshots.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
